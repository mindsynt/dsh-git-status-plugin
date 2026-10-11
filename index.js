/**
 * Git Branch Status — Host half.
 *
 * Serves the live Git state of every DSH workspace directory and every live
 * Session working directory at one authenticated Fetch route
 * (`GET /api/git-status`), which the browser half polls on an interval.
 *
 * Commit history is separate: `GET /api/git-status/log?dir=<path>` answers one
 * Session's working directory, on demand only, for a directory the Host already
 * probes. The log is cached far longer than the status, and is never part of the
 * polling cadence.
 *
 * Every probe is read-only. `GIT_OPTIONAL_LOCKS=0` keeps a monitoring call
 * from refreshing the index or racing a Git command the agent is already
 * running, and `LC_ALL=C` pins Git's diagnostics to English so the
 * not-a-repository / missing-directory classification is stable regardless of
 * the operator's locale.
 */

import { spawn } from 'node:child_process'

const ROUTE_PATH = '/api/git-status'
const LOG_ROUTE_PATH = '/api/git-status/log'
const GIT_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 750
const LOG_TTL_MS = 30000
const LOG_COUNT = 20
const POLL_MS = 1500
const MAX_DIRECTORIES = 32
const MAX_STDOUT_BYTES = 256 * 1024

/** Commit subject first, so free-form text never splits a field. */
const LOG_FORMAT = '%s%x1f%h%x1f%cI%x1f%an'

const GIT_ENV = {
  ...process.env,
  LC_ALL: 'C',
  LC_MESSAGES: 'C',
  LANGUAGE: 'C',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0'
}

/** Run one read-only git invocation with a bounded timeout and bounded output. */
function runGit(directory, args, timeoutMs = GIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let child
    try {
      child = spawn('git', ['-C', directory, ...args], {
        env: GIT_ENV,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      resolve({ code: -1, note: String(error?.message ?? error), stdout: '', stderr: '' })
      return
    }
    const finish = (code, note) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, note, stdout, stderr })
    }
    const timer = setTimeout(() => {
      if (!settled) {
        try { child.kill('SIGKILL') } catch { /* already exited */ }
      }
      finish(-1, 'git timed out')
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_STDOUT_BYTES) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => finish(-1, String(error?.message ?? error)))
    child.on('close', (code, signal) => finish(code ?? -1, signal ? `terminated by ${signal}` : undefined))
  })
}

const emptyChanges = () => ({ modified: 0, added: 0, deleted: 0, renamed: 0, copied: 0, unmerged: 0, untracked: 0 })

/** Fold one `git status --porcelain --branch` document into display data. */
function parseStatus(text) {
  const result = {
    branch: null,
    upstream: null,
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    emptyRepo: false,
    detached: false,
    changes: emptyChanges(),
    changeCount: 0
  }
  let headerSeen = false
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0) continue
    if (!headerSeen && line.startsWith('##')) {
      headerSeen = true
      const tail = line.slice(2).trim()
      const bracket = /\[([^\]]*)\]\s*$/.exec(tail)
      const body = bracket ? tail.slice(0, bracket.index).trim() : tail
      if (body.startsWith('No commits yet on ')) {
        result.emptyRepo = true
        result.branch = body.slice('No commits yet on '.length).trim()
      } else if (body === 'HEAD' || /^HEAD \(no branch\)$/.test(body)) {
        result.detached = true
      } else {
        const separator = body.indexOf('...')
        if (separator >= 0) {
          result.branch = body.slice(0, separator).trim() || null
          result.upstream = body.slice(separator + 3).trim() || null
        } else {
          result.branch = body.trim() || null
        }
      }
      if (bracket) {
        const ahead = /ahead\s+(\d+)/.exec(bracket[1])
        const behind = /behind\s+(\d+)/.exec(bracket[1])
        if (ahead) result.ahead = Number(ahead[1])
        if (behind) result.behind = Number(behind[1])
        if (/gone/.test(bracket[1])) result.upstreamGone = true
      }
      continue
    }
    const code = line.slice(0, 2)
    for (const character of code) {
      if (character === 'M') result.changes.modified += 1
      else if (character === 'A') result.changes.added += 1
      else if (character === 'D') result.changes.deleted += 1
      else if (character === 'R') result.changes.renamed += 1
      else if (character === 'C') result.changes.copied += 1
      else if (character === 'U') result.changes.unmerged += 1
    }
    if (code === '??') result.changes.untracked += 1
    result.changeCount += 1
  }
  return result
}

function firstLine(text) {
  const line = (text || '').split('\n').map(entry => entry.trim()).filter(Boolean)[0]
  return line || null
}

/** Probe one directory with two read-only git calls. */
async function collectEntry(directory) {
  const entry = {
    directory,
    repoRoot: null,
    state: 'error',
    branch: null,
    detached: false,
    emptyRepo: false,
    upstream: null,
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    hash: null,
    changes: emptyChanges(),
    changeCount: 0,
    dirty: false,
    error: null
  }
  const [status, meta] = await Promise.all([
    runGit(directory, ['status', '--porcelain', '--branch', '--untracked-files=normal']),
    runGit(directory, ['rev-parse', '--show-toplevel', '--short', 'HEAD'])
  ])
  const noise = `${status.stderr}\n${meta.stderr}`
  if (/not a git repository/i.test(noise)) {
    entry.state = 'not-a-repo'
    return entry
  }
  if (/cannot change to|No such file or directory/i.test(noise)) {
    entry.state = 'missing'
    return entry
  }
  if (status.code !== 0) {
    entry.error = firstLine(status.stderr) ?? status.note ?? 'git status failed'
    return entry
  }
  entry.state = 'repo'
  const metaLines = meta.stdout.split('\n').map(line => line.trim()).filter(Boolean)
  entry.repoRoot = metaLines[0] || null
  if (meta.code === 0 && metaLines.length > 1) entry.hash = metaLines[1] || null
  Object.assign(entry, parseStatus(status.stdout))
  entry.dirty = entry.changeCount > 0
  return entry
}

/**
 * Fold one `git log --format=%s%x1f%h%x1f%cI%x1f%an` document into rows.
 * The subject comes first because it is the only free-form field, so the
 * remaining split is always exactly hash, date, author.
 */
function parseLog(text) {
  const rows = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.length === 0) continue
    const parts = line.split('\x1f')
    const subject = parts[0]
    if (subject === undefined || subject.length === 0) continue
    rows.push({
      subject: subject || null,
      hash: parts[1] || null,
      date: parts[2] || null,
      author: parts.length > 3 ? parts.slice(3).join('\x1f') : null
    })
  }
  return rows
}

/**
 * The last commits of one directory, fetched only on demand.
 *
 * The directory must be in the Host's own probed set: this route takes a path
 * from the browser, and without the check the Client could make the Host run
 * git in any directory at all.
 */
async function logOf(ctx, directory, cache) {
  const answer = { directory, state: 'error', branch: null, log: [], error: null, checkedAt: Date.now() }
  const allowed = knownDirectories(ctx).map(row => row.directory)
  if (typeof directory !== 'string' || directory.length === 0 || !allowed.includes(directory)) {
    answer.state = 'unknown'
    answer.error = 'directory is not in the probed set'
    return answer
  }
  const hit = cache.get(directory)
  if (hit !== undefined && hit.expiresAt > Date.now()) return { ...hit.entry }
  const entry = await collectEntry(directory)
  answer.state = entry.state
  answer.branch = entry.branch
  answer.error = entry.error
  if (entry.state === 'repo') {
    const outcome = await runGit(directory, ['log', '--no-decorate', `--format=${LOG_FORMAT}`, '-n', String(LOG_COUNT)])
    if (outcome.code === 0) {
      answer.log = parseLog(outcome.stdout)
      answer.error = null
    } else if (entry.emptyRepo) {
      // A branch with no commits fails rather than returning nothing, and it is
      // not an error worth surfacing: the view says "no commits yet".
      answer.log = []
      answer.error = null
    } else {
      answer.error = firstLine(outcome.stderr) ?? outcome.note ?? 'git log failed'
    }
  } else {
    answer.error = null
  }
  answer.checkedAt = Date.now()
  cache.set(directory, { expiresAt: answer.checkedAt + LOG_TTL_MS, entry: answer })
  return answer
}

/** Directories worth reporting: registered workspaces, live Sessions, default. */
function knownDirectories(ctx) {
  const out = []
  const seen = new Set()
  const add = (value, source) => {
    if (typeof value !== 'string' || value.length === 0) return
    const key = value.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
    if (key.length === 0 || seen.has(key)) return
    seen.add(key)
    out.push({ directory: key, source })
  }
  const workingDirectory = ctx.get('workingDirectory')
  const registry = ctx.get('workspaceRegistry')
  try {
    for (const workspace of registry?.list() ?? []) add(workspace?.path, 'workspace')
  } catch { /* registry unavailable */ }
  const agents = ctx.get('agents')
  try {
    for (const agent of agents?.list() ?? []) add(workingDirectory?.get(agent.session), 'session')
  } catch { /* live agent table unavailable */ }
  try {
    add(workingDirectory?.defaultDirectory, 'default')
  } catch { /* default directory unavailable */ }
  return out.slice(0, MAX_DIRECTORIES)
}

async function snapshotOf(ctx, cache) {
  const checkedAt = Date.now()
  const entries = []
  for (const { directory, source } of knownDirectories(ctx)) {
    const hit = cache.get(directory)
    let entry = hit && hit.expiresAt > Date.now() ? hit.entry : null
    if (entry === null) {
      entry = await collectEntry(directory)
      cache.set(directory, { expiresAt: Date.now() + CACHE_TTL_MS, entry })
      if (cache.size > MAX_DIRECTORIES * 2) {
        for (const key of cache.keys()) {
          if (cache.size <= MAX_DIRECTORIES * 2) break
          if (cache.get(key).expiresAt <= Date.now()) cache.delete(key)
        }
      }
    }
    entries.push({ ...entry, source, checkedAt })
  }
  // Registered workspaces lead, then live Session directories, then the default;
  // alphabetical within a group so the order is stable between polls.
  const rank = { workspace: 0, session: 1, default: 2 }
  entries.sort((a, b) => (rank[a.source] ?? 9) === (rank[b.source] ?? 9)
    ? String(a.directory).localeCompare(String(b.directory))
    : (rank[a.source] ?? 9) - (rank[b.source] ?? 9))
  return { checkedAt, pollMs: POLL_MS, entries }
}

function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

/** No user-facing settings: the report covers every known directory. */
export const inject = ['connection']

export function apply(ctx) {
  const cache = new Map()
  const logCache = new Map()
  ctx.effect(async () => {
    const dispose = await ctx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          return jsonResponse(await snapshotOf(ctx, cache), 200)
        } catch (error) {
          ctx.logger?.warn?.('dsh-git-status: status collection failed', error)
          return jsonResponse({
            checkedAt: Date.now(),
            pollMs: POLL_MS,
            error: String(error?.message ?? error),
            entries: []
          }, 500)
        }
      }
    })
    return () => dispose()
  }, 'dsh-git-status: GET /api/git-status')

  // Commit history is read when someone looks at it, never on the polling
  // cadence: the status route already spawns git twice per directory every
  // 1.5 s, and nobody is watching a log most of the time.
  ctx.effect(async () => {
    const dispose = await ctx.connection.fetch.register({
      path: LOG_ROUTE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          return jsonResponse(await logOf(ctx, url.searchParams.get('dir') ?? '', logCache), 200)
        } catch (error) {
          ctx.logger?.warn?.('dsh-git-status: log collection failed', error)
          return jsonResponse({
            directory: null,
            state: 'error',
            branch: null,
            log: [],
            error: String(error?.message ?? error),
            checkedAt: Date.now()
          }, 500)
        }
      }
    })
    return () => dispose()
  }, 'dsh-git-status: GET /api/git-status/log')
}
