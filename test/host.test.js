/**
 * Host tests. The parsers are checked against synthetic documents, and one
 * fixture repository checks the real wire format of `git status --porcelain`
 * and `git log --graph`, including a multibyte subject through the pipe.
 */

import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOG_FORMAT, apply, normalizeDirectory, parseLog, parseStatus, runGit } from '../index.js'

/* ---------------------------------------------------------- */
/* Fixture repository                                          */
/* ---------------------------------------------------------- */

const workspace = mkdtempSync(join(tmpdir(), 'dsgs-host-test-'))
const repoPath = join(workspace, 'repo')
const barePath = join(workspace, 'bare.git')

const git = (directory, ...args) => {
  execFileSync('git', ['-C', directory, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
}

mkdirSync(repoPath)
git(repoPath, '-c', 'init.defaultBranch=main', 'init')
writeFileSync(join(repoPath, 'a.txt'), 'one\n')
git(repoPath, 'add', '.')
git(repoPath, '-c', 'user.name=测试', '-c', 'user.email=test@example.com', 'commit', '-m', '中文提交信息')
git(repoPath, 'checkout', '-b', 'feature')
writeFileSync(join(repoPath, 'b.txt'), 'feature\n')
git(repoPath, 'add', '.')
git(repoPath, '-c', 'user.name=测试', '-c', 'user.email=test@example.com', 'commit', '-m', 'feature commit')
git(repoPath, 'checkout', 'main')
writeFileSync(join(repoPath, 'c.txt'), 'main\n')
git(repoPath, 'add', '.')
git(repoPath, '-c', 'user.name=测试', '-c', 'user.email=test@example.com', 'commit', '-m', 'main commit')
// The merge is what draws connector art (`|\`, `|/`) into `git log --graph`
// for this history; an unforked branch line would not.
git(repoPath, '-c', 'user.name=测试', '-c', 'user.email=test@example.com', 'merge', '--no-ff', '-m', 'merge feature', 'feature')
// A staged and an unstaged change to one file, plus one untracked entry.
writeFileSync(join(repoPath, 'a.txt'), 'two\n')
git(repoPath, 'add', 'a.txt')
writeFileSync(join(repoPath, 'a.txt'), 'three\n')
writeFileSync(join(repoPath, 'd.txt'), 'untracked\n')

execFileSync('git', ['init', '--bare', '-q', barePath])

after(() => { rmSync(workspace, { recursive: true, force: true }) })

/* ---------------------------------------------------------- */
/* parseStatus                                                 */
/* ---------------------------------------------------------- */

describe('parseStatus', () => {
  it('counts a file with staged and unstaged changes once', () => {
    const result = parseStatus('## main\nMM src/a.ts\n')
    assert.equal(result.branch, 'main')
    assert.equal(result.changes.modified, 1)
    assert.equal(result.changeCount, 1)
  })

  it('counts each unmerged file once', () => {
    const result = parseStatus('## main\nUU f1\nAA f2\nDD f3\n')
    assert.equal(result.changes.unmerged, 3)
    assert.equal(result.changeCount, 3)
  })

  it('sorts one file into exactly one bucket', () => {
    const result = parseStatus('## main\nAM x\n D y\nR  a -> b\n?? z\n')
    assert.deepEqual(result.changes, {
      modified: 0,
      added: 1,
      deleted: 1,
      renamed: 1,
      copied: 0,
      unmerged: 0,
      untracked: 1
    })
    assert.equal(result.changeCount, 4)
  })

  it('reads ahead, behind and a gone upstream', () => {
    const result = parseStatus('## main...origin/main [ahead 2, behind 3, gone]\n')
    assert.equal(result.branch, 'main')
    assert.equal(result.upstream, 'origin/main')
    assert.equal(result.ahead, 2)
    assert.equal(result.behind, 3)
    assert.equal(result.upstreamGone, true)
  })

  it('reads an unborn branch as an empty repository', () => {
    const result = parseStatus('## No commits yet on main\n')
    assert.equal(result.emptyRepo, true)
    assert.equal(result.branch, 'main')
  })

  it('reads a detached head', () => {
    const result = parseStatus('## HEAD (no branch)\n')
    assert.equal(result.detached, true)
    assert.equal(result.branch, null)
  })
})

/* ---------------------------------------------------------- */
/* parseLog                                                    */
/* ---------------------------------------------------------- */

describe('parseLog', () => {
  it('keeps the graph art and splits the commit fields', () => {
    const rows = parseLog('| * \x1eabc123\x1f2026-01-02T03:04:05Z\x1fAnn\x1fsubject text\n')
    assert.deepEqual(rows, [{
      art: '| * ',
      hash: 'abc123',
      date: '2026-01-02T03:04:05Z',
      author: 'Ann',
      subject: 'subject text'
    }])
  })

  it('keeps connector lines as art-only rows', () => {
    const rows = parseLog('|\\  \n|/  \n')
    assert.deepEqual(rows, [{ art: '|\\  ' }, { art: '|/  ' }])
  })

  it('keeps a subject containing the field separator whole', () => {
    const rows = parseLog('* \x1eh1\x1fdate\x1fAnn\x1fs1\x1fs2\n')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].subject, 's1\x1fs2')
  })

  it('drops blank lines and keeps art without a commit marker', () => {
    const rows = parseLog('   \n  \x1eh1\x1fdate\x1fAnn\x1fsubject\n')
    assert.deepEqual(rows, [{ art: '  ', hash: 'h1', date: 'date', author: 'Ann', subject: 'subject' }])
  })
})

/* ---------------------------------------------------------- */
/* normalizeDirectory                                          */
/* ---------------------------------------------------------- */

describe('normalizeDirectory', () => {
  it('folds duplicate and trailing slashes', () => {
    assert.equal(normalizeDirectory('a//b//'), 'a/b')
    assert.equal(normalizeDirectory('/'), '')
    assert.equal(normalizeDirectory(undefined), '')
  })
})

/* ---------------------------------------------------------- */
/* runGit against real git                                     */
/* ---------------------------------------------------------- */

describe('runGit', () => {
  it('probes a real repository through git', async () => {
    const status = await runGit(repoPath, ['status', '--porcelain', '--branch', '--untracked-files=normal'])
    assert.equal(status.code, 0)
    const parsed = parseStatus(status.stdout)
    assert.equal(parsed.branch, 'main')
    // a.txt is staged as modified and modified again in the worktree: one file.
    assert.equal(parsed.changes.modified, 1)
    assert.equal(parsed.changes.untracked, 1)
    assert.equal(parsed.changeCount, 2)

    const meta = await runGit(repoPath, ['rev-parse', '--show-toplevel', '--short', 'HEAD'])
    assert.equal(meta.code, 0)
    assert.equal(meta.stdout.split('\n')[0].trim(), realpathSync(repoPath))

    const log = await runGit(repoPath, ['log', '--graph', '--no-decorate', `--format=${LOG_FORMAT}`, '-n', '20'])
    assert.equal(log.code, 0)
    const rows = parseLog(log.stdout)
    // The multibyte subject survives the pipe; the branch fork draws a
    // connector line with no commit fields.
    const subject = rows.find(row => row.hash !== undefined && row.subject === '中文提交信息')
    assert.ok(subject, 'the Chinese subject row is present')
    assert.ok(subject.art.startsWith('*'))
    assert.ok(rows.some(row => row.hash === undefined && row.art.includes('|/')))
  })

  it('classifies a bare repository by its diagnostic', async () => {
    const status = await runGit(barePath, ['status', '--porcelain', '--branch'])
    assert.notEqual(status.code, 0)
    assert.match(status.stderr, /this operation must be run in a work tree/i)
  })
})

/* ---------------------------------------------------------- */
/* apply: the two Fetch routes                                 */
/* ---------------------------------------------------------- */

/** A minimal Host context whose only known directory is the fixture repo. */
function contextWithRepository() {
  const effectBodies = []
  const routes = new Map()
  const ctx = {
    get(name) {
      if (name === 'workingDirectory') return { defaultDirectory: repoPath }
      if (name === 'workspaceRegistry') return { list: () => [] }
      if (name === 'agents') return { list: () => [] }
      return undefined
    },
    effect(body) { effectBodies.push(body()) },
    logger: { warn() {} },
    connection: {
      fetch: {
        register: async (definition) => {
          routes.set(definition.path, definition.fetch)
          return () => {}
        }
      }
    }
  }
  apply(ctx)
  return {
    routes,
    async settled() { await Promise.all(effectBodies) }
  }
}

describe('apply', () => {
  it('serves a status snapshot and a commit log for the fixture repo', async () => {
    const { routes, settled } = contextWithRepository()
    await settled()
    const status = await routes.get('/api/git-status')()
    const body = await status.json()
    assert.equal(body.entries.length, 1)
    assert.equal(body.entries[0].directory, normalizeDirectory(repoPath))
    assert.equal(body.entries[0].state, 'repo')
    assert.equal(body.entries[0].source, 'default')

    const log = await routes.get('/api/git-status/log')(
      new Request(`http://host/api/git-status/log?dir=${encodeURIComponent(repoPath)}`)
    )
    const logBody = await log.json()
    assert.equal(logBody.state, 'repo')
    assert.equal(logBody.branch, 'main')
    assert.ok(logBody.log.some(row => row.subject === 'merge feature'))
  })

  it('matches a log directory written with duplicated slashes', async () => {
    const { routes, settled } = contextWithRepository()
    await settled()
    const log = await routes.get('/api/git-status/log')(
      new Request(`http://host/api/git-status/log?dir=${encodeURIComponent(repoPath + '//')}`)
    )
    assert.equal((await log.json()).state, 'repo')
  })

  it('refuses a log directory outside the probed set', async () => {
    const { routes, settled } = contextWithRepository()
    await settled()
    const log = await routes.get('/api/git-status/log')(
      new Request('http://host/api/git-status/log?dir=%2Fetc')
    )
    const body = await log.json()
    assert.equal(body.state, 'unknown')
    assert.equal(body.log.length, 0)
  })
})
