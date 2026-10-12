window.__ModuleLoader__.load({
  id: '@local/dsh-git-status',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect

    const NAMESPACE = 'gitStatus'
    const ROUTE = '/api/git-status'
    const LOG_ROUTE = '/api/git-status/log'
    const MAX_ROWS = 5
    const MIN_POLL_MS = 500
    const MAX_POLL_MS = 60000
    // How often the always-mounted workspace-header seat refreshes on its own.
    // Deliberately outside the live poll: see the note above `subscribe`. It is
    // gated on there being a label to update and on nobody polling faster, so it
    // is silent when the sidebar is closed or a Strip is already refreshing.
    const SLOW_REFRESH_MS = 30000

    const DICTIONARIES = {
      en: {
        branch: 'branch',
        detached: 'detached HEAD',
        clean: 'clean working tree',
        changes: '{count} change(s)',
        modified: 'modified',
        added: 'added',
        deleted: 'deleted',
        renamed: 'renamed',
        copied: 'copied',
        unmerged: 'unmerged',
        untracked: 'untracked',
        ahead: 'ahead {count}',
        behind: 'behind {count}',
        upstream: 'upstream',
        noUpstream: 'no upstream',
        head: 'HEAD',
        repository: 'repository',
        directory: 'directory',
        notGitRepo: 'not a git repository',
        missingDir: 'directory missing',
        unavailable: 'git status unavailable',
        noCommits: 'no commits yet',
        updated: 'updated',
        more: '+{count} more',
        error: 'error',
        view: 'Git log',
        commits: 'Commits',
        noCwd: 'this conversation has no directory',
        notProbed: "not this conversation's directory",
        loading: 'loading…',
        retry: 'Retry'
      },
      zh: {
        branch: '分支',
        detached: '游离头指针',
        clean: '工作区干净',
        changes: '{count} 处改动',
        modified: '已修改',
        added: '新增',
        deleted: '删除',
        renamed: '重命名',
        copied: '复制',
        unmerged: '冲突未解决',
        untracked: '未跟踪',
        ahead: '领先 {count}',
        behind: '落后 {count}',
        upstream: '上游',
        noUpstream: '无上游',
        head: 'HEAD',
        repository: '仓库',
        directory: '目录',
        notGitRepo: '不是 Git 仓库',
        missingDir: '目录不存在',
        unavailable: '无法获取 Git 状态',
        noCommits: '尚无提交',
        updated: '更新于',
        more: '另有 {count} 项',
        error: '出错',
        view: '提交记录',
        commits: '提交记录',
        noCwd: '当前对话没有目录',
        notProbed: '不是当前对话的目录',
        loading: '加载中…',
        retry: '重试'
      }
    }

    const CSS = [
      '.dsgs-strip{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}',
      '.dsgs-pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:1;cursor:pointer}',
      '.dsgs-pill:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}',
      '.dsgs-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dsgs-pill:active{transform:translateY(1px)}',
      '.dsgs-glyph{flex:none}',
      '.dsgs-branch{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);letter-spacing:.01em}',
      '.dsgs-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsgs-repo{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsgs-clean{color:var(--dsw-alias-state-success-primary);font-weight:600}',
      '.dsgs-dirty{color:var(--dsw-alias-state-warn-primary);font-weight:600}',
      '.dsgs-idle{color:var(--dsw-alias-state-idle-primary);font-weight:600}',
      '.dsgs-error{color:var(--dsw-alias-state-error-primary);font-weight:600}',
      '.dsgs-sync{font-size:11px;font-weight:600;color:var(--dsw-alias-brand-primary)}',
      '.dsgs-more{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsgs-stale-note{font-size:11px;font-weight:600;color:var(--dsw-alias-state-error-primary)}',
      '.dsgs-stale .dsgs-pill{opacity:.65}',
      /* Commit log view. Rendered only while its tab is active, so the log is
         fetched when someone opens it and never on the polling cadence. */
      '.dsgs-log{display:flex;flex-direction:column;flex:1;min-height:0;height:100%}',
      '.dsgs-log__head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0}',
      '.dsgs-log__head strong{color:var(--dsw-alias-label-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsgs-log__head .dsgs-mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsgs-log__count{flex:none}',
      /* The branch tree is one <pre>: git draws the art column itself, so the
         row reproduces `git log --graph` verbatim. The commit columns are inline
         spans, styled but never laid out independently. */
      '.dsgs-log__tree{margin:0;padding:12px 14px;overflow:auto;flex:1;min-height:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.75;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}',
      '.dsgs-log__art{color:var(--dsw-alias-state-idle-primary)}',
      '.dsgs-log__mark{color:var(--dsw-alias-brand-primary);font-weight:700}',
      '.dsgs-log__hash{color:var(--dsw-alias-brand-primary)}',
      '.dsgs-log__meta{color:var(--dsw-alias-label-secondary);opacity:.75}',
      '.dsgs-log__subject{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
      '.dsgs-log__note{padding:28px 14px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsgs-log__note strong{display:block;color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:5px}',
      '.dsgs-log__note button{margin-top:10px;font:inherit;font-size:12px;padding:3px 10px;border-radius:11px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer}',
      /* Workspace group-header label. The header dispatches no slots, so the
         seat is a CSS custom property on the title element plus an ::after:
         React owns no `style` there, the property survives its re-renders, and
         no foreign node enters a React-owned subtree.
        
         inline-flex + vertical-align: middle keeps the smaller mono text level
         with the 14px title rather than dropping to the baseline. */
      '[style*="--dsgs-label"]::after{content:var(--dsgs-label);display:inline-flex;align-items:center;vertical-align:middle;height:16px;margin-left:8px;padding-left:8px;border-left:1px solid var(--dsw-alias-border-l1);color:var(--dsgs-label-color,var(--dsw-alias-label-secondary));font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:600;line-height:1;letter-spacing:.01em;white-space:nowrap}'
    ].join('\n')

    /* ---------------------------------------------------------- */
    /* One shared poll: one in-flight request and one interval serve */
    /* every rendered row. The cadence stops when the last seat a   */
    /* human can actually see unmounts, and never runs at all while */
    /* the document is hidden.                                      */
    /*                                                              */
    /* The workspace-header seat is the exception. It lives in      */
    /* `shell.overlay`, which AppFrame renders unconditionally, so  */
    /* subscribing there would hold the fast cadence open for the   */
    /* window's whole lifetime with nobody watching. It keeps its   */
    /* own slow tick instead.                                       */
    /* ---------------------------------------------------------- */
    const state = { entries: [], error: null, pollMs: 1500, fetchedAt: null }
    const listeners = new Set()
    let controller = null
    let timer = null

    function notify() {
      for (const listener of [...listeners]) {
        try { listener() } catch { /* one row must not break another */ }
      }
    }

    /** One fetch. Whether anything schedules the next one is the caller's call. */
    async function refresh() {
      if (controller !== null) controller.abort()
      const current = new AbortController()
      controller = current
      let response
      try {
        response = await fetch(ROUTE, {
          signal: current.signal,
          headers: { accept: 'application/json' },
          cache: 'no-store'
        })
      } catch {
        if (controller === current) {
          // Keep the last known rows visible (dimmed) rather than blanking the
          // strip: the branch name is still useful while polling is failing.
          state.error = 'network'
          notify()
        }
        return
      }
      if (controller !== current) return
      let body = null
      try { body = await response.json() } catch { /* malformed body */ }
      if (!response.ok || !body || typeof body !== 'object') {
        state.error = `HTTP ${response.status}`
        notify()
        return
      }
      if (Array.isArray(body.entries)) {
        state.entries = body.entries.filter(entry => entry && typeof entry === 'object')
      }
      if (typeof body.pollMs === 'number' && Number.isFinite(body.pollMs)) {
        const next = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(body.pollMs)))
        if (next !== state.pollMs) {
          state.pollMs = next
          reschedule()
        }
      }
      if (typeof body.checkedAt === 'number') state.fetchedAt = body.checkedAt
      state.error = null
      notify()
    }

    function visible() {
      return typeof document === 'object' && document !== null && document.visibilityState === 'visible'
    }

    function stopTimer() {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }

    /** Arm the fast cadence, unless nobody is looking or the page is hidden. */
    function reschedule() {
      stopTimer()
      if (listeners.size === 0) return
      if (!visible()) return
      timer = setInterval(() => { void refresh() }, state.pollMs)
    }

    /**
     * Arm the fast cadence for one seat a human can see: a Files panel strip
     * or a Session hover card. The commit-log view fetches its own route on
     * demand and does not use this. Always-mounted seats must not either, or
     * the poll never stops.
     */
    function subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1 && visible()) {
        void refresh()
        reschedule()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          if (controller !== null) {
            controller.abort()
            controller = null
          }
          stopTimer()
        }
      }
    }

    /* ---------------------------------------------------------- */
    /* Rendering                                                   */
    /* ---------------------------------------------------------- */
    const identityTranslate = (key) => key

    function basenameOf(path) {
      if (!path) return ''
      const parts = String(path).split(/[\\/]+/).filter(Boolean)
      return parts.length ? parts[parts.length - 1] : String(path)
    }

    function describeChanges(translate, entry) {
      const order = ['modified', 'added', 'deleted', 'renamed', 'copied', 'unmerged', 'untracked']
      return order
        .filter(key => entry.changes[key] > 0)
        .map(key => `${entry.changes[key]} ${translate(key)}`)
        .join(', ')
    }

    function syncText(translate, entry) {
      const bits = []
      if (entry.ahead > 0) bits.push(translate('ahead', { count: entry.ahead }))
      if (entry.behind > 0) bits.push(translate('behind', { count: entry.behind }))
      return bits.join(' · ')
    }

    function statusText(translate, entry) {
      if (entry.state === 'repo') {
        const bits = [entry.branch || (entry.hash ? `${translate('head')} ${entry.hash}` : translate('detached'))]
        bits.push(entry.dirty ? translate('changes', { count: entry.changeCount }) : translate('clean'))
        if (entry.upstreamGone) bits.push(`${translate('upstream')} ${entry.upstream} ${translate('error')}`)
        return bits.filter(Boolean).join(', ')
      }
      if (entry.state === 'not-a-repo') return translate('notGitRepo')
      if (entry.state === 'missing') return translate('missingDir')
      return translate('error')
    }

    function normalizePath(path) {
      // Slash-terminated and duplicate slashes are equivalent as directories,
      // so compare in one form: the owner path and the probed path.
      if (!path) return ''
      let value = String(path).replace(/\\/g, '/').replace(/\/{2,}/g, '/')
      if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1)
      return value
    }

    /** True when `path` is the repository root or a directory inside it. */
    function covers(entry, path) {
      if (!path) return false
      const root = normalizePath(entry.repoRoot || entry.directory)
      const target = normalizePath(path)
      if (!root || !target) return false
      return target === root || target.startsWith(root + '/')
    }

    function tooltipFor(translate, entry) {
      const lines = [statusText(translate, entry)]
      if (entry.repoRoot) {
        lines.push(`${translate('repository')}: ${entry.repoRoot}`)
        if (entry.directory && entry.directory !== entry.repoRoot) {
          lines.push(`${translate('directory')}: ${entry.directory}`)
        }
      } else if (entry.directory) {
        // No repository: still name the directory so an overflow list stays
        // attributable, since these rows carry no branch to read.
        lines.push(`${translate('directory')}: ${entry.directory}`)
      }
      if (entry.state === 'repo') {
        if (entry.upstream) lines.push(`${translate('upstream')}: ${entry.upstream}${entry.upstreamGone ? ' (' + translate('error') + ')' : ''}`)
        else lines.push(translate('noUpstream'))
        if (entry.emptyRepo) lines.push(translate('noCommits'))
        const sync = syncText(translate, entry)
        if (sync) lines.push(sync)
        if (entry.dirty) lines.push(`${translate('changes', { count: entry.changeCount })}: ${describeChanges(translate, entry)}`)
        if (entry.hash) lines.push(`${translate('head')}: ${entry.hash}`)
      }
      if (entry.error) lines.push(`${translate('error')}: ${entry.error}`)
      return lines.join('\n')
    }

    function Glyph(props) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 13,
        height: 13,
        'aria-hidden': 'true',
        focusable: 'false',
        className: props && props.className ? props.className : 'dsgs-glyph'
      },
        h('circle', { cx: 4, cy: 3.2, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 4, cy: 12.8, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 3.2, r: 1.9, fill: 'currentColor' }),
        h('path', { d: 'M4 5.2v5.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none' }),
        h('path', { d: 'M4 10.6C4 7.6 6.9 5 12 5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none', opacity: 0.55 }),
      )
    }

    /**
     * One tone serves every surface, so the branch reads the same colour
     * whether it sits in the workspace header, the Files panel, or a Session
     * hover card. The classes are the shared `.dsgs-clean`/`-dirty`/`-idle`/
     * `-error` set, which the header's ::after rule reuses by name.
     */
    function toneOf(entry) {
      if (entry.state === 'error') return 'dsgs-error'
      if (entry.state !== 'repo') return 'dsgs-idle'
      return entry.dirty ? 'dsgs-dirty' : 'dsgs-clean'
    }

    /** The words a non-repository, a missing directory, or a probe error get. */
    function stateText(translate, entry) {
      if (entry.state === 'not-a-repo') return translate('notGitRepo')
      if (entry.state === 'missing') return translate('missingDir')
      return translate('error')
    }

    function Pill(props) {
      const { translate, entry, multi } = props
      const tone = toneOf(entry)
      const parts = [h(Glyph, { key: 'glyph', className: `dsgs-glyph ${tone}` })]
      if (multi) {
        parts.push(h('span', { key: 'repo', className: 'dsgs-repo', title: entry.repoRoot || entry.directory }, basenameOf(entry.repoRoot || entry.directory)))
      }
      if (entry.state === 'repo') {
        parts.push(h('span', { key: 'branch', className: `dsgs-branch ${tone}` }, entry.branch || translate('detached')))
        if (entry.emptyRepo) parts.push(h('span', { key: 'empty', className: 'dsgs-idle' }, translate('noCommits')))
        if (entry.ahead > 0 || entry.behind > 0) {
          const bits = []
          if (entry.ahead > 0) bits.push(`↑${entry.ahead}`)
          if (entry.behind > 0) bits.push(`↓${entry.behind}`)
          parts.push(h('span', { key: 'sync', className: 'dsgs-sync', title: syncText(translate, entry) }, bits.join(' ')))
        }
        parts.push(h('span', {
          key: 'status',
          className: tone,
          title: entry.dirty ? describeChanges(translate, entry) : translate('clean')
        }, entry.dirty ? `● ${entry.changeCount}` : '●'))
        if (entry.hash) parts.push(h('span', { key: 'hash', className: 'dsgs-mono' }, entry.hash))
      } else {
        parts.push(h('span', { key: 'status', className: tone }, stateText(translate, entry)))
        if (entry.error) parts.push(h('span', { key: 'detail', className: 'dsgs-mono' }, String(entry.error)))
      }
      return h('button', {
        type: 'button',
        className: 'dsgs-pill',
        title: tooltipFor(translate, entry),
        'aria-label': statusText(translate, entry),
        onClick: () => { void refresh() }
      }, parts)
    }

    /** Subscribe to the shared poll and to locale changes; one hook for every seat. */
    function useSnapshot(locale) {
      const [, setTick] = useState(0)
      useEffect(() => {
        const dispose = subscribe(() => { setTick(tick => tick + 1) })
        const offLocale = locale && typeof locale.subscribe === 'function'
          ? locale.subscribe(() => { setTick(tick => tick + 1) })
          : null
        return () => {
          dispose()
          if (offLocale) offLocale()
        }
      }, [locale])
      return { entries: state.entries, error: state.error }
    }

    function buildStrip(translate, locale) {
      function Strip(seatProps) {
        const { entries, error } = useSnapshot(locale)
        // A seat that names a directory reports that one repository. One that
        // does not (or names none) shows every known directory.
        const scope = typeof seatProps === 'object' && seatProps !== null ? seatProps.absolutePath : undefined
        const scoped = typeof scope === 'string' && scope.length > 0
        const rows = scoped
          ? entries.filter(entry => covers(entry, scope))
          : entries
        const unavailable = `${translate('unavailable')} (${error})`
        const errorTitle = scoped ? `${translate('directory')}: ${scope}\n${unavailable}` : unavailable
        const children = []
        if (rows.length === 0) {
          // Show the failure pill when there is nothing to read: never any data
          // at all, or the scoped directory's status not being probed. When
          // data exists but does not cover this directory, stay out of the way.
          if (error === null || (scoped && entries.length > 0)) return null
          return h('div', { key: 'strip', className: 'dsgs-strip', 'data-dsh-git-status': 'error' }, children,
            h('button', {
              key: 'error',
              type: 'button',
              className: 'dsgs-pill',
              title: errorTitle,
              'aria-label': translate('unavailable'),
              onClick: () => { void refresh() }
            },
              h(Glyph, { className: 'dsgs-glyph' }),
              h('span', { className: 'dsgs-error' }, translate('unavailable')),
              h('span', { className: 'dsgs-mono' }, String(error)),
            )
          )
        }
        // Basenames are only a way to tell rows apart: in the panel's own
        // action row the directory is already on screen, so it is redundant.
        const multi = !scoped && rows.length > 1
        const visible = Math.min(rows.length, MAX_ROWS)
        for (let i = 0; i < visible; i += 1) {
          children.push(h(Pill, { key: `row-${i}`, translate: translate, entry: rows[i], multi: multi }))
        }
        if (rows.length > MAX_ROWS) {
          children.push(h('span', {
            key: 'more',
            className: 'dsgs-more',
            title: rows.slice(MAX_ROWS).map(entry => tooltipFor(translate, entry)).join('\n---\n')
          }, translate('more', { count: rows.length - MAX_ROWS })))
        }
        const stripProps = { className: 'dsgs-strip', 'data-dsh-git-status': 'strip' }
        if (error !== null) {
          // Last-known rows stay on screen, dimmed, with the failure reason.
          stripProps.className = 'dsgs-strip dsgs-stale'
          stripProps.title = unavailable
          children.push(h('span', {
            key: 'stale-note',
            className: 'dsgs-stale-note',
            title: unavailable
          }, String(error)))
        }
        return h('div', stripProps, children)
      }
      return Strip
    }

    /* ---------------------------------------------------------- */
    /* Sidebar Session seats                                       */
    /* ---------------------------------------------------------- */
    // The Session-row seats are root-scoped: they receive the row's Session
    // id and nothing else, because a Session-scoped seat would bind and
    // retain every listed Session. The global `useSessions` standard prop
    // reads the directory that the Sidebar already knows without binding.
    const NO_SESSIONS = () => null

    function useSessionDirectory(props) {
      // `NO_SESSIONS` keeps the call count stable if the standard prop is
      // ever absent (it is not, in the shipped Sidebar).
      const read = typeof props.useSessions === 'function' ? props.useSessions : NO_SESSIONS
      const cwd = read((sessions) => {
        const row = sessions && sessions.byId ? sessions.byId[props.sessionId] : undefined
        return row && typeof row.cwd === 'string' ? row.cwd : null
      })
      return typeof cwd === 'string' && cwd.length > 0 ? cwd : null
    }

    function buildSessionSeats(translate, locale, Strip) {
      // The Session hover card has room, so it renders the real pill. The row's
      // 16px leading cell is deliberately left to the Sidebar's own status dots.
      function Hover(props) {
        const cwd = useSessionDirectory(props)
        if (cwd === null) return null
        return h(Strip, { absolutePath: cwd })
      }
      return { Hover }
    }

    /* ---------------------------------------------------------- */
    /* Commit log conversation view                                */
    /* ---------------------------------------------------------- */
    // A whole view tab, not a decoration: `conversation.view` entries are how
    // the Conversation shell offers alternative readings of a Session, and each
    // body is only rendered while its tab is active (DefaultConversationViews
    // dispatches with `only: viewId`). That is what makes this on demand — the
    // log is fetched when someone opens the tab, and never on the polling
    // cadence, which would mean one more git spawn per directory per 1.5 s.
    //
    // The directory comes from the global `useSessions` standard prop, the same
    // way the Session seats find theirs, so no Session is bound or retained.

    /** Render one `%cI` value as "14:32" or "Jul 21 14:32". */
    function formatWhen(iso) {
      const when = typeof iso === 'string' ? new Date(iso) : null
      if (when === null || Number.isNaN(when.getTime())) return ''
      const parts = new Intl.DateTimeFormat(
        undefined,
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      ).formatToParts(when)
      const get = (type) => {
        const hit = parts.find(part => part.type === type)
        return hit ? hit.value : ''
      }
      const day = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(when)
      const now = new Date()
      const sameDay = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(now) === day
        && new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(when)
          === new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(now)
      return sameDay ? `${get('hour')}:${get('minute')}` : `${get('month')} ${day} ${get('hour')}:${get('minute')}`
    }

    /**
     * One child per line of `git log --graph`, in order. A commit line yields the
     * art stem, its `*` marker, then the hash, meta, and subject; a connector
     * line yields art only. Newlines are literal text, so the <pre> prints the
     * tree exactly as Git drew it.
     */
    function timelineChildren(rows) {
      const children = []
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i]
        if (!row) continue
        const art = typeof row.art === 'string' ? row.art : ''
        const key = `${i}-${row.hash || 'art'}`
        if (!row.hash) {
          children.push(h('span', { key, className: 'dsgs-log__art' }, art))
        } else {
          // Split at the last '*' so the stem stays muted and the marker takes
          // the branch colour. The tail keeps the marker's trailing spaces, which
          // is what holds the following columns at their correct offset.
          // `git log --graph` always puts a '*' on a commit line, so the guard is
          // only there to keep an unexpected input from being sliced at -1; with
          // no marker there is nothing to highlight, so the whole art reads as
          // muted stem rather than as a coloured marker.
          const found = art.lastIndexOf('*')
          const markAt = found < 0 ? art.length : found
          children.push(h('span', { key: `${key}-stem`, className: 'dsgs-log__art' }, art.slice(0, markAt)))
          children.push(h('span', { key: `${key}-mark`, className: 'dsgs-log__mark' }, art.slice(markAt)))
          children.push(h('span', { key: `${key}-hash`, className: 'dsgs-log__hash' }, row.hash))
          const meta = [row.author, formatWhen(row.date)].filter(part => part).join(' · ')
          if (meta.length > 0) {
            children.push(' ')
            children.push(h('span', { key: `${key}-meta`, className: 'dsgs-log__meta' }, meta))
            children.push(' ')
          }
          children.push(h('span', { key: `${key}-subject`, className: 'dsgs-log__subject' }, row.subject || ''))
        }
        children.push('\n')
      }
      return children
    }

    function buildGitView(translate, locale) {
      function LogView(props) {
        const cwd = useSessionDirectory(props)
        const [data, setData] = useState(null)
        const [failed, setFailed] = useState(null)
        const [reload, setReload] = useState(0)

        useEffect(() => {
          if (cwd === null) {
            setData(null)
            setFailed(null)
            return undefined
          }
          let live = true
          setData(null)
          setFailed(null)
          fetch(`${LOG_ROUTE}?dir=${encodeURIComponent(cwd)}`, {
            headers: { accept: 'application/json' },
            cache: 'no-store'
          })
            .then(async (response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const body = await response.json()
              if (live && body && typeof body === 'object') setData(body)
            })
            .catch((error) => {
              if (live) setFailed(String(error && error.message ? error.message : error))
            })
          return () => { live = false }
        }, [cwd, reload, locale])

        if (cwd === null) {
          return h('div', { className: 'dsgs-log' }, h('div', { className: 'dsgs-log__note' }, translate('noCwd')))
        }
        if (failed !== null) {
          return h('div', { className: 'dsgs-log' }, h('div', { className: 'dsgs-log__note' },
            h('strong', null, translate('error')),
            h('span', null, String(failed)),
            h('button', { type: 'button', onClick: () => setReload(reload + 1) }, translate('retry'))
          ))
        }
        if (data === null) {
          return h('div', { className: 'dsgs-log' }, h('div', { className: 'dsgs-log__note' }, translate('loading')))
        }
        // `unknown` is the Host refusing a directory it does not probe;
        // anything else is what the probe itself said.
        if (data.state !== 'repo') {
          const heading = data.state === 'unknown'
            ? translate('notProbed')
            : (data.state === 'error' ? translate('unavailable') : stateText(translate, data))
          return h('div', { className: 'dsgs-log' }, h('div', { className: 'dsgs-log__note' },
            h('strong', null, heading),
            h('span', null, String(data.directory)),
            data.error ? h('span', null, String(data.error)) : null
          ))
        }
        const rows = Array.isArray(data.log) ? data.log : []
        const commits = rows.reduce((count, row) => count + (row && row.hash ? 1 : 0), 0)
        return h('div', { className: 'dsgs-log' },
          h('div', { key: 'head', className: 'dsgs-log__head' },
            h(Glyph, { className: 'dsgs-glyph' }),
            h('strong', null, data.branch || translate('detached')),
            h('span', { className: 'dsgs-log__count' }, `${translate('commits')} · ${commits}`),
            typeof data.checkedAt === 'number'
              ? h('span', { className: 'dsgs-mono' }, `${translate('updated')} ${formatWhen(new Date(data.checkedAt).toISOString())}`)
              : null,
            h('button', {
              key: 'refresh',
              type: 'button',
              title: translate('retry'),
              onClick: () => setReload(reload + 1)
            }, '↻')
          ),
          rows.length === 0
            ? h('div', { key: 'empty', className: 'dsgs-log__note' }, translate('noCommits'))
            : h('pre', { key: 'tree', className: 'dsgs-log__tree' }, timelineChildren(rows))
        )
      }
      return LogView
    }

    /* ---------------------------------------------------------- */
    /* Sidebar workspace group-header label                        */
    /* ---------------------------------------------------------- */
    // The group header (ProjectRowItem) dispatches no slot at all, so nothing
    // in the slot system reaches that row. What it does expose is a stable
    // data-row-key="workspace:<workspaceId>" attribute, and the Workspace list
    // — with each workspace's canonical path — is readable through the global
    // `useWorkspaces` standard prop. So the header's directory is known
    // without touching the row's DOM, and the label is written as a CSS custom
    // property on the header's title container, drawn by the ::after rule
    // above. That span carries no `style` in the shipped vdom, so the
    // property survives React's re-renders, and no foreign node is inserted
    // into a React-owned subtree.
    const NO_WORKSPACES = () => []
    const HEADER_KEY = 'workspace:'
    let workspaceItems = []

    /**
     * The header's title element: the row's only child that carries visible
     * text, walked down to its deepest text-bearing descendant.
     *
     * Walking down matters. `.projectText` is `display: flex; flex-direction:
     * column`, so an ::after attached there is a second flex item rendered
     * *below* the title rather than beside it. The inner `.title` span is a
     * plain inline box with its own ellipsis, so an ::after there is real text
     * on the same line, clipped by the same edge.
     */
    function headerTitleEl(rowEl) {
      const children = rowEl.children
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i]
        if (child !== null && typeof child.textContent === 'string' && child.textContent.trim().length > 0) {
          let el = child
          while (el.childElementCount === 1) {
            const inner = el.firstElementChild
            if (inner === null) break
            if (typeof inner.textContent !== 'string' || inner.textContent.trim().length === 0) break
            el = inner
          }
          return el
        }
      }
      return null
    }

    function entryForPath(path) {
      if (typeof path !== 'string' || path.length === 0) return undefined
      return state.entries.find(candidate => covers(candidate, path))
    }

    /**
     * Only a live branch earns a label. The colour is the same mapping the
     * pill uses, so a clean branch reads green and a dirty one amber in the
     * header exactly as it does in the panel and the hover card.
     */
    function headerLabel(translate, entry) {
      if (entry === undefined || entry.state !== 'repo') return null
      const name = entry.branch || translate('detached')
      const color = toneOf(entry) === 'dsgs-dirty'
        ? 'var(--dsw-alias-state-warn-primary)'
        : 'var(--dsw-alias-state-success-primary)'
      return { text: `(${name})`, color }
    }

    function buildHeaderLabelSync(translate, locale) {
      function sync() {
        const byId = new Map()
        for (const workspace of workspaceItems) {
          if (workspace && workspace.workspaceId !== undefined && typeof workspace.path === 'string') {
            byId.set(workspace.workspaceId, workspace.path)
          }
        }
        // A workspace the user renamed has no id to match against, so the
        // visible title is matched to a probed directory's folder name.
        const byName = new Map()
        for (const entry of state.entries) {
          const root = entry.repoRoot || entry.directory
          if (typeof root === 'string' && root.length > 0) {
            const name = basenameOf(root)
            if (name.length > 0 && !byName.has(name)) byName.set(name, root)
          }
        }
        const rows = document.querySelectorAll(`[data-row-key^="${HEADER_KEY}"]`)
        for (const row of rows) {
          const el = headerTitleEl(row)
          if (el === null) continue
          const key = typeof row.getAttribute('data-row-key') === 'string' ? row.getAttribute('data-row-key') : ''
          let path = byId.get(key.slice(HEADER_KEY.length)) || null
          if (path === null) {
            const title = el.textContent.trim()
            path = title.length > 0 ? (byName.get(title) || null) : null
          }
          const label = headerLabel(translate, entryForPath(path))
          if (label === null) {
            el.style.removeProperty('--dsgs-label')
            el.style.removeProperty('--dsgs-label-color')
          } else {
            el.style.setProperty('--dsgs-label', `"${String(label.text).replace(/"/g, '\\"')}"`)
            el.style.setProperty('--dsgs-label-color', label.color)
          }
        }
      }
      function Sync(props) {
        // `NO_WORKSPACES` keeps the hook call count stable if the standard prop
        // is ever absent (it is not, for the frame-wide overlay seat).
        const read = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : NO_WORKSPACES
        const items = read((snapshot) => (snapshot && Array.isArray(snapshot.items) ? snapshot.items : []))
        const [, setTick] = useState(0)

        useEffect(() => {
          workspaceItems = items
          sync()
          // A workspace appearing or leaving changes the set the Host probes, so
          // the labels need a fresh probe even though no Strip is mounted.
          if (listeners.size === 0 && visible()) void refresh()
        }, [items])

        useEffect(() => {
          const offLocale = locale && typeof locale.subscribe === 'function'
            ? locale.subscribe(() => { setTick(tick => tick + 1); sync() })
            : null
          // Rows mount and remount as groups fold and unfold, far faster than
          // the poll cadence, so a heartbeat re-attaches the labels. It only
          // reads whatever the last poll wrote.
          const heartbeat = setInterval(() => sync(), 500)
          // This seat is mounted unconditionally, so `subscribe` would hold the
          // live cadence open for the whole time the window is open with nobody
          // watching. Instead a slow tick carries the header labels alone, and
          // only fetches when a label can actually be seen: no workspace rows in
          // the DOM means the sidebar is closed and there is nothing to update,
          // and a mounted Strip is already refreshing at its own cadence.
          const slow = setInterval(() => {
            if (!visible()) return
            if (listeners.size > 0) return
            if (document.querySelectorAll(`[data-row-key^="${HEADER_KEY}"]`).length === 0) return
            void refresh()
          }, SLOW_REFRESH_MS)
          return () => {
            if (offLocale !== null) offLocale()
            clearInterval(heartbeat)
            clearInterval(slow)
          }
        }, [])

        return null
      }
      return Sync
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          if (!ctx.locale || typeof ctx.locale.register !== 'function') return () => {}
          try {
            return ctx.locale.register(NAMESPACE, DICTIONARIES)
          } catch (error) {
            console.warn('[dsh-git-status] locale registration failed:', error && error.message)
            return () => {}
          }
        }, 'dsh-git-status: dictionaries')

        // The stylesheet is installed once, at apply time, rather than rendered
        // by a component: the header label is driven by a CSS custom property
        // and an ::after rule, and every rendered seat can be an empty one —
        // with no Files panel open and nothing hovered, no Strip ever mounts,
        // so a component-owned <style> would never reach the document.
        ctx.effect(() => {
          if (typeof document === 'object' && document !== null) {
            const element = document.createElement('style')
            element.setAttribute('data-dsh-git-status', 'styles')
            element.textContent = CSS
            document.head.appendChild(element)
            return () => element.remove()
          }
          return () => {}
        }, 'dsh-git-status: stylesheet')

        const translate = ctx.locale && typeof ctx.locale.bind === 'function'
          ? ctx.locale.bind(NAMESPACE)
          : identityTranslate
        const view = buildStrip(translate, ctx.locale)
        const seats = buildSessionSeats(translate, ctx.locale, view)
        const headerSync = buildHeaderLabelSync(translate, ctx.locale)
        const gitView = buildGitView(translate, ctx.locale)

        ctx.effect(() => {
          const onVisibility = () => {
            if (visible()) {
              if (listeners.size === 0) return
              reschedule()
              void refresh()
            } else {
              stopTimer()
            }
          }
          document.addEventListener('visibilitychange', onVisibility)
          return () => document.removeEventListener('visibilitychange', onVisibility)
        }, 'dsh-git-status: poll only while visible')

        // Two seats on the Sidebar: the full pill inside a Session row's hover
        // card, and the workspace header label below. The row's leading cell is
        // left to the Sidebar's own status dots.
        ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
          name: 'sidebar.session.row.hover',
          id: 'git-status',
          order: 10
        }, seats.Hover))

        // The Files panel's directory action row: the same strip, narrowed to
        // the panel's own directory, with room for the branch name.
        ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
          name: 'sidebar.right.tab.files.actions',
          id: 'git-status',
          order: 10
        }, view))

        // A third reading of the Conversation: this Session's commit log. The
        // tab bar is session-independent, so the tab is always offered and the
        // empty states above carry the "only if there is one" part.
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'git-log',
          order: 20,
          locale: NAMESPACE,
          label: () => translate('view')
        }, gitView))

        // The workspace group header has no seat of its own, so its label is
        // synced imperatively. This entry renders nothing; the overlay layer is
        // the one always-mounted list seat, which is what keeps the sync alive.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'git-status',
          order: 10
        }, headerSync))
      }
    }
  }
})
