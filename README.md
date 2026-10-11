# dsh-git-status — live Git branch indicator for the DSH workspace

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
