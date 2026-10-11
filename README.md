# dsh-git-status — live Git branch indicator for the DSH workspace
# dsh-git-status — DSH 工作区实时 Git 分支指示器

> **Bilingual README** — English first, 中文 after. Every section mirrors its
> counterpart 1:1. / **双语 README** —— 英文在前，中文在后，章节一一对应。

---

## English

Shows which Git branch each workspace is on, **refreshed continuously** — as a
branch label directly after the workspace name in the Sidebar's workspace group
header, with the full detail in the Session row's hover card and in the Files
panel's directory action row.

- **What it shows** — the branch name, upstream tracking with ahead/behind
  counts, working-tree change counts, the short `HEAD` hash, plus the `not a
  git repository`, `missing directory`, `no commits yet`, and `error` states.
- **Where it shows** — one header label plus three additive seats:
  - **Workspace group header** — `(branch)` immediately after the workspace
    name, in monospace with a hairline separator. Only a live branch earns a
    label: a non-repository, a missing directory, or a probe error leaves the
    header untouched. *This one is not a slot* — the shipped group header
    dispatches none, so it is synced imperatively; see [Header label](#header-label) below.
  - `sidebar.session.row.hover` — the full pill in the Session row's hover
    card, narrowed to that Session's repository.
  - `sidebar.right.tab.files.actions` — the Files panel's directory action row,
    beside the tree's reload control, narrowed to the panel's own directory.
  - `conversation.view` (id `git-log`, order 20) — a third reading of the
    Conversation, next to Chat and Trajectory: this Session's commit log,
    fetched when the tab is opened. See [Commit log](#commit-log) below.
  - The Session row's 16px leading cell is **deliberately not used** — it
    already holds the Sidebar's own status dots, so occupying it put the branch
    in front of the Session title rather than beside the workspace name.
- **State colour** — one mapping, shared by every surface through `toneOf()`, so
  a branch reads the same colour in the header as in the panel and the hover
  card: **green** (`state-success-primary`) when the working tree is clean,
  **amber** (`state-warn-primary`) when it is dirty, **muted**
  (`state-idle-primary`) for a non-repository or a missing directory, and
  **red** (`state-error-primary`) on a probe error. In a pill the branch name
  and the branch glyph both carry it, alongside the existing `● n` marker; the
  `↑/↓` upstream count keeps its own brand colour because ahead/behind is a
  separate fact from the working tree.
- **How a Session gets a directory** — that Sidebar seat is root-scoped: it
  receives the row's Session id and nothing else, because a Session-scoped seat
  would bind and retain every listed Session. The directory is read from the
  Sidebar's own session list through the global `useSessions` standard prop,
  which looks a Session up by id without binding it.
- **How a Workspace gets a directory** — through the global `useWorkspaces`
  standard prop, which returns every workspace's id and canonical path without
  binding it. The header row is matched on `data-row-key="workspace:<id>"`.
- **Scope** — the Host probes every known directory and the Client narrows that
  set to the owner's path. That works for subdirectories inside a probed
  repository too, since a directory counts as covered by the repository that
  contains it. A path outside every probed directory hides the widget entirely
  rather than reporting something unrelated — even while the probe is failing.
- **How it stays live** — the Host half answers `GET /api/git-status` (an
  authenticated connection Fetch route) with a fresh probe of each directory;
  the Client half polls it on the interval the Host reports (1.5 s), stops the
  interval when the last pill unmounts, and refreshes immediately on window
  focus, on visibility change, and on click. The commit log is the exception:
  it is fetched on its own route only when its view tab is opened.

### Header label

`ProjectRowItem` renders the workspace group header with no `renderSlot`
dispatch at all — it is the only Sidebar row without one — so no slot reaches
it. The label is therefore written directly, and deliberately in the least
invasive way:

- The header row is found by its `data-row-key="workspace:<workspaceId>"`
  attribute, and its title element is the row's only child carrying visible
  text, **walked down to its deepest text-bearing descendant**. No CSS-module
  class name has to be guessed — but the walk does matter, and here is why:
  `.projectText` is `display: flex; flex-direction: column`, so an `::after`
  attached there is a *second flex item*, drawn on a second line below the
  title. The inner `.title` span is a plain inline box with its own ellipsis,
  so the `::after` there is real text beside the name, clipped at the same
  edge.
- The label is stored as a CSS custom property (`--dsgs-label`, plus
  `--dsgs-label-color`) on that container and drawn by a single `::after` rule.
  The container carries no `style` in the shipped vdom, so React never overwrites
  the property, and no foreign element is inserted into a React-owned subtree —
  which is what keeps the reconciler from ever fighting this.
- The stylesheet is installed once by an `apply()` effect, **not** rendered by a
  component. Every seat here can be empty: with no Files panel open and nothing
  hovered, no Strip ever mounts, so a component-owned `<style>` would never
  reach the document and the label would silently not draw.
- Because groups fold and unfold, mounting and unmounting their rows outside
  the poll cadence, a 500 ms heartbeat re-attaches the labels to newly mounted
  rows.
- A workspace the user has **renamed** has no id in the workspace list to match,
  so its visible title is matched against the probed directories' folder names
  as a fallback. That is a best-effort guess and simply yields no label if it
  cannot resolve, never a wrong branch.

### Commit log

`GET /api/git-status/log?dir=<path>` answers one directory's last commits, and
it is the only route in the bundle that takes a path from the browser — which
is why it refuses anything the Host does not already probe:

```
git -C <dir> log --no-decorate --format=%s%x1f%h%x1f%cI%x1f%an -n 20
```

- **Allowed set.** The directory must be in `knownDirectories()`; anything else
  gets `state: 'unknown'` with no git run at all. Without this the route would
  let the Client make the Host run git in any directory.
- **On demand.** A `conversation.view` body is only rendered while its tab is
  active (`renderSlot('conversation.view', owner, { only: viewId })`), so the
  log is fetched when someone opens the tab. It is deliberately *not* added to
  the poll: that would be a third git spawn per directory every 1.5 s for
  nobody's benefit.
- **Longer cache.** `LOG_TTL_MS` is 30 s against the status route's 750 ms, on
  its own cache, keyed by directory. Reopening the tab is cheap.
- **One separator, subject first.** `%s` comes first because it is the only
  free-form field, so splitting on `\x1f` always yields hash, date, author
  afterwards. `--no-decorate` skips tag and branch annotations; there is no
  `--stat` and no patch body.
- **An unborn branch is not an error.** With no commits, `git log` exits 128
  rather than returning nothing, so that diagnostic is swallowed and the view
  says "no commits yet".
- **Always offered.** `conversation.view` tabs are projected from slot
  registrations and are session-independent — there is no per-Session hiding
  hook, only the shipped `developerTools` filter for the Trajectory view. So
  the tab is always present and the "only if there is one" part is carried by
  the empty states: no directory, not a repository, not probed, no commits.

## Repository probing

Two read-only git calls per directory, behind a 750 ms Host-side cache:

```
git -C <dir> status --porcelain --branch --untracked-files=normal
git -C <dir> rev-parse --show-toplevel --short HEAD
```

`GIT_OPTIONAL_LOCKS=0` keeps a monitoring call from refreshing the index or
racing a Git command the agent is already running, `LC_ALL=C` pins Git's
diagnostics to English so the failure classification does not depend on the
operator's locale, and every invocation has a 3 s timeout and a bounded
output buffer. Nothing ever mutates a repository.

The Host probes every directory DSH knows about (registered workspaces, each
live Session's working directory, the default directory) and returns them all;
the Client narrows that set to the panel's `absolutePath`. Rendered outside
the panel — with no owner path — every probed directory shows as its own pill,
each carrying the repository folder name, up to five rows, the remainder
collapsing into a `+N more` entry whose tooltip lists the hidden ones.
Registered workspaces sort first, then live Session directories, then the
default directory; each group is alphabetical so the order is stable between
polls.

## Layout

```
package.json         bundle + dsh.client manifest
cordis.patch.yml     inserts the `git-status` plugin row
index.js             Host half: both routes, git probes, two caches
client.js            Client half: poller, Sidebar/File-panel seats, log view
locale/{en,zh}.json  inventory metadata (meta.title / meta.description)
icon.svg             plugin icon
```

## Install / uninstall

```
plugin_manager install_bundle  <absolute path to this directory>
plugin_manager remove_bundle   @local/dsh-git-status
```

Installation and re-enabling apply through HMR, and disabling removes the row
and stops polling.

## Editing it

The two halves reload very differently, which matters when you change the code:

- **Client half (`client.js`) hot-updates.** The client bundle is stat-polled,
  so an edit reaches the browser within about a second; no page reload needed.
- **Host half (`index.js`) does not.** This is a `link:`-installed dynamic
  package resolved through `node_modules`, which the HMR watcher excludes, so
  the process keeps its cached module namespace. Toggling the bundle off and
  on through `plugin_manager set_bundle` re-runs `apply()` but does **not**
  re-import the module. To pick up Host changes, restart the process that owns
  the profile (for the Web profile, `dsh web`).

## Extending it

- Move the widget: change the slot keys in `client.js` —
  `sidebar.session.row.hover` (the hover card pill) and
  `sidebar.right.tab.files.actions` (the Files panel row) — and the matching
  registration beneath them. The workspace header label is `buildHeaderLabelSync`,
  mounted through the `shell.overlay` registration (it renders nothing; the
  overlay is only the always-mounted seat that keeps the sync alive). To also
  claim a Session row's leading cell, re-add a `sidebar.session.row.leading`
  seat — knowing that cell already holds the Sidebar's own status dots and is
  too narrow for text.
- Narrow or widen the report: `knownDirectories()` in `index.js` is the single
  place that decides which directories are probed. A Session row only gets a
  badge when the Host probes its working directory, so a Session whose cwd is
  not a registered workspace needs the `agents`/`workingDirectory` sources
  turned on.
- Tune the cadence: `POLL_MS` (Client poll interval, also returned to the
  Client) and `CACHE_TTL_MS` (Host probe cache) in `index.js`.

---

## 中文

持续刷新地显示每个工作区目录所在的 Git 分支 —— 以分支标签的形式紧跟在 Sidebar
工作区分组标题中的工作区名称之后；完整信息则出现在 Session 行的悬停卡片以及
Files 面板的目录操作行里。

- **显示什么** —— 分支名、上游跟踪的领先/落后计数、工作区改动数量、`HEAD` 短哈希，
  以及 `not a git repository`（不是 Git 仓库）、`missing directory`（目录不存在）、
  `no commits yet`（尚无提交）、`error`（探测出错）等状态。
- **显示在哪** —— 一个组头标签，外加三个可叠加的挂载点（seat）：
  - **工作区分组标题** —— 紧跟在工作区名称之后的 `(分支)`，等宽字体加一条细分隔线。
    只有真实的分支才会获得标签：非仓库、目录不存在或探测出错时，标题保持原样。
    *这一处不是 slot* —— 现有的分组标题不派发任何 slot，因此它是命令式同步的；
    见下文[组头标签](#组头标签)。
  - `sidebar.session.row.hover` —— Session 行悬停卡片中的完整药丸，收窄到该 Session 的仓库。
  - `sidebar.right.tab.files.actions` —— Files 面板的目录操作行，位于树的刷新控件旁，
    收窄到面板自身的目录。
  - `conversation.view`（id 为 `git-log`，order 20）—— Conversation 的第三种视图，
    与 Chat、Trajectory 并列：本 Session 的提交记录，在标签页打开时才抓取。
    见下文[提交记录](#提交记录)。
  - Session 行 16px 的前导单元格**刻意不使用** —— 那里已经放着 Sidebar 自己的状态圆点，
    占用它会让分支跑到 Session 标题之前，而不是并排在工作区名称旁边。
- **状态配色** —— 单一映射，经 `toneOf()` 在所有表面共享，因此分支在组头、面板和悬停卡片
  里都是同一种颜色：工作区**干净为绿色**（`state-success-primary`），
  **有改动为琥珀色**（`state-warn-primary`），**非仓库或目录不存在为灰色**
  （`state-idle-primary`），**探测出错为红色**（`state-error-primary`）。在药丸里，
  分支名和分支图标都带上这个颜色，与已有的 `● n` 标记并列；`↑/↓` 上游计数保持它自己的
  品牌色，因为领先/落后与工作区状态是两件不同的事实。
- **Session 如何拿到目录** —— 那个 Sidebar 挂载点是根作用域的：它只收到该行的 Session id，
  别无其他，因为一个 Session 作用域的挂载点会绑定并保留每一个列出的 Session。目录通过
  全局 `useSessions` 标准 prop 从 Sidebar 自己的会话列表中读取，它按 id 查找 Session
  而不绑定它。
- **Workspace 如何拿到目录** —— 通过全局 `useWorkspaces` 标准 prop，它返回每个工作区的
  id 与规范路径而不绑定。标题行按 `data-row-key="workspace:<id>"` 匹配。
- **作用域** —— Host 端探测所有已知目录，Client 端把结果收窄到归属方的路径。这同样适用于
  被探测仓库内部的子目录，因为一个目录算作被包含它的那个仓库所覆盖。任何落在所有被探测
  目录之外的路径都会完全隐藏组件，而不是报告不相干的东西 —— 即使此时探测本身正在失败。
- **如何保持实时** —— Host 端回答 `GET /api/git-status`（一条带鉴权的连接级 Fetch 路由），
  返回对每个目录的最新探测结果；Client 端按 Host 上报的间隔轮询（1.5 秒），在最后一个
  药丸卸载时停掉定时器，并在窗口聚焦、可见性变化、点击时立即刷新。提交记录是例外：它走
  自己的路由，仅在其视图标签被打开时抓取。

### 组头标签

`ProjectRowItem` 渲染工作区分组标题时完全不派发 `renderSlot` —— 它是唯一没有 slot 的
Sidebar 行 —— 因此没有任何 slot 能到达它。标签于是直写上去，而且刻意采用最小侵入的方式：

- 标题行通过其 `data-row-key="workspace:<workspaceId>"` 属性找到，而它的 title 元素是整行中
  唯一携带可见文本的子元素，**需要一路向下走到它最深的带文本后代**。这样不必猜测 CSS-module
  类名 —— 但这一步下行确实重要，原因如下：`.projectText` 是
  `display: flex; flex-direction: column`，在那里挂 `::after` 会产生*第二个 flex 项*，
  绘制在标题下方的第二行。而内层 `.title` span 是带自己省略号的普通内联盒子，那里的
  `::after` 才是真正与名称并排的文本，并在同一边界被裁切。
- 标签被存成 CSS 自定义属性（`--dsgs-label`，以及 `--dsgs-label-color`）挂在该容器上，
  由一条 `::after` 规则绘制。该容器在交付的 vdom 中不带任何 `style`，因此 React 永远不会
  覆写这个属性；也没有外来元素被插入 React 拥有的子树 —— 这正是让 reconciler 从不与它打架的
  关键。
- 样式表由一个 `apply()` 副作用安装一次，**不是**由组件渲染。这里每个挂载点都可能为空：
  当 Files 面板没打开、也没有任何悬停时，任何 Strip 都不会挂载，所以组件自有的 `<style>`
  永远到不了文档，标签就会静默地不显示。
- 因为分组会折叠与展开，其行会在轮询节奏之外被挂载和卸载，所以有一个 500 ms 的心跳把标签
  重新挂到新挂载的行上。
- 用户**重命名过**的工作区在工作区列表里没有可匹配的 id，因此回退去用它的可见标题匹配被探测
  目录的文件夹名。这是尽力而为的猜测，解析不出来就干脆不显示标签，绝不会显示错误的分支。

### 提交记录

`GET /api/git-status/log?dir=<path>` 回答单个目录的最近提交，也是整个插件里唯一接受来自
浏览器的路径的路由 —— 正因如此，它会拒绝任何 Host 尚未探测过的路径：

```
git -C <dir> log --no-decorate --format=%s%x1f%h%x1f%cI%x1f%an -n 20
```

- **允许集合。** 目录必须存在于 `knownDirectories()` 中；否则返回 `state: 'unknown'` 且完全不
  执行 git。没有这道防线，这条路由就等于允许 Client 让 Host 在任意目录里跑 git。
- **按需抓取。** `conversation.view` 的 body 只在其标签处于激活状态时才会渲染
  （`renderSlot('conversation.view', owner, { only: viewId })`），因此提交记录是在有人打开该
  标签时才抓取的。刻意*没有*把它加进轮询：那意味着每个目录每 1.5 秒多出一次无人需要的 git 进程。
- **更长的缓存。** `LOG_TTL_MS` 是 30 秒，而状态路由只有 750 ms，且用的是独立的、按目录为键的
  缓存。重新打开标签页很便宜。
- **单一分隔符，主题在前。** `%s` 放在第一位，因为它是唯一的自由文本字段，这样按 `\x1f` 切分后
  剩下的必然是哈希、日期、作者。`--no-decorate` 跳过 tag 与分支注释；没有 `--stat`，也没有补丁正文。
- **未诞生分支不算错误。** 没有提交时，`git log` 会以 128 退出而不是返回空，所以那条诊断被吞掉，
  视图显示 "no commits yet"（尚无提交）。
- **始终提供。** `conversation.view` 标签是从 slot 注册表投影出来的，与 Session 无关 —— 不存在
  按 Session 隐藏的钩子，只有为 Trajectory 视图提供的 `developerTools` 过滤器。所以该标签始终
  存在，"仅有内容时才显示"这一层由空状态承担：没有目录、不是仓库、未被探测、没有提交。

## 仓库探测

每个目录两次只读 git 调用，后接 750 ms 的 Host 侧缓存：

```
git -C <dir> status --porcelain --branch --untracked-files=normal
git -C <dir> rev-parse --show-toplevel --short HEAD
```

`GIT_OPTIONAL_LOCKS=0` 让监控调用不去刷新索引、也不与 agent 正在运行的 Git 命令抢锁；
`LC_ALL=C` 把 Git 的诊断信息固定为英文，使失败分类不依赖操作者的语言环境；每次调用都有 3 秒
超时和有界输出缓冲区。任何情况下都不会改动仓库。

Host 会探测 DSH 知道的所有目录（已注册工作区、每个活跃 Session 的工作目录、默认目录）并全部
返回；Client 再把这组结果收窄到面板的 `absolutePath`。渲染在面板之外（没有归属路径）时，每个
被探测目录都显示为自己的药丸，各自携带仓库文件夹名，最多五行，其余折叠进一个 `+N more` 条目，
其提示框列出被隐藏的那些。已注册工作区排在最前，然后是活跃 Session 目录，最后才是默认目录；
每组内部按字母序排列，使顺序在多次轮询之间保持稳定。

## 目录结构

```
package.json         bundle + dsh.client 清单
cordis.patch.yml     插入 `git-status` 插件行
index.js             Host 端：两条路由、git 探测、两个缓存
client.js            Client 端：轮询器、Sidebar/文件面板挂载点、日志视图
locale/{en,zh}.json  清单元数据（meta.title / meta.description）
icon.svg             插件图标
```

## 安装 / 卸载

```
plugin_manager install_bundle  <此目录的绝对路径>
plugin_manager remove_bundle   @local/dsh-git-status
```

安装与重新启用都通过 HMR 生效；禁用则会移除该行并停止轮询。

## 如何修改

两端的热更新行为差异很大，改代码时这一点很重要：

- **Client 端（`client.js`）支持热更新。** 客户端 bundle 采用 stat 轮询，因此改动大约一秒钟内
  就会到达浏览器，无需刷新页面。
- **Host 端（`index.js`）不支持。** 这是一个通过 `node_modules` 解析的 `link:` 安装动态包，
  而 HMR 监视器把它排除在外，所以进程会继续持有缓存的模块命名空间。通过
  `plugin_manager set_bundle` 把插件关掉再打开会重新执行 `apply()`，但**不会**重新 import 该模块。
  要让 Host 改动生效，需要重启拥有该 profile 的进程（对 Web profile 来说是 `dsh web`）。

## 如何扩展

- 移动组件位置：改 `client.js` 里的 slot 键 —— `sidebar.session.row.hover`（悬停卡片药丸）与
  `sidebar.right.tab.files.actions`（Files 面板行）—— 以及它们下方对应的注册。工作区组头标签是
  `buildHeaderLabelSync`，经由 `shell.overlay` 注册挂载（它不渲染任何内容；该 overlay 只是那个
  始终保持挂载、以维持同步存活的挂载点）。若想同时占用 Session 行的前导单元格，重新加一个
  `sidebar.session.row.leading` 挂载点即可 —— 但要清楚那个单元格已经放着 Sidebar 自己的状态圆点，
  而且对文本来说太窄。
- 收窄或放宽探测范围：`index.js` 中的 `knownDirectories()` 是决定哪些目录被探测的唯一位置。只有
  当 Host 探测了某个 Session 的工作目录时，其行才会获得徽章，因此工作目录不是已注册工作区的
  Session 需要打开 `agents`/`workingDirectory` 来源。
- 调整节奏：`index.js` 中的 `POLL_MS`（Client 轮询间隔，同时返回给 Client）与 `CACHE_TTL_MS`
  （Host 探测缓存）。
