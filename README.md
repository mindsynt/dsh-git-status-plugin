# dsh-git-status — live Git branch indicator for the DSH workspace
# dsh-git-status — DSH 工作区实时 Git 分支指示器

**Language / 语言：** [🇬🇧 English](#english) · [🇨🇳 中文](#中文)

---

## English

<details>
<summary><strong>🇬🇧 English</strong></summary>

A DSH plugin that shows which Git branch each workspace directory is on,
**refreshed continuously** — no manual refresh, no reload.

### What it shows

- The **branch name** and a branch glyph, coloured by state.
- **Upstream sync** — the `↑/↓` ahead/behind counts against the tracking branch.
- **Working-tree changes** — the `● n` count of files that differ from `HEAD`.
- The short **`HEAD` hash**.
- Four failure states instead of guessing: `not a git repository`,
  `missing directory`, `no commits yet`, and `error`.

### Where it shows

| Surface | What you see |
| --- | --- |
| Sidebar, workspace group header | `(branch)` right after the workspace name |
| Session row, hover card | The full pill for that session's repository |
| Files panel, directory action row | The pill for the directory the panel is showing |
| Conversation → `git-log` | This session's last 20 commits, fetched when the tab opens |

Everything is additive — no existing DSH element is replaced or hidden. A
non-repository, a missing directory, or a probe error simply shows no label
rather than a wrong one.

### State colour

| State | Colour |
| --- | --- |
| Working tree clean | 🟢 green `state-success-primary` |
| Working tree dirty | 🟠 amber `state-warn-primary` |
| Not a repository, or directory missing | ⚪ muted `state-idle-primary` |
| Probe error | 🔴 red `state-error-primary` |

One mapping is shared by every surface, so a branch reads the same colour in the
header, in the panel, and in the hover card. The `↑/↓` upstream count keeps its
own brand colour — ahead/behind is a separate fact from a dirty working tree.

### Install / uninstall

```
plugin_manager install_bundle  <absolute path to this directory>
plugin_manager remove_bundle   @local/dsh-git-status
```

Installing and re-enabling apply through HMR; disabling removes the labels and
stops polling.

[↑ back to top](#dsh-git-status--live-git-branch-indicator-for-the-dsh-workspace)

</details>

---

## 中文

<details open>
<summary><strong>🇨🇳 中文</strong></summary>

一个 DSH 插件，显示每个工作区目录所在的 Git 分支，**持续自动刷新** —— 无需手动
刷新，也无需重新加载页面。

### 显示什么

- **分支名**与分支图标，颜色随状态变化。
- **上游同步** —— 相对跟踪分支的 `↑/↓` 领先/落后计数。
- **工作区改动** —— 相对 `HEAD` 的文件差异数 `● n`。
- `HEAD` **短哈希**。
- 四种明确的失败状态，而不是靠猜：`not a git repository`、`missing directory`、
  `no commits yet`、`error`。

### 显示在哪

| 位置 | 看到什么 |
| --- | --- |
| Sidebar，工作区分组标题 | 工作区名称后紧跟 `(分支)` |
| Session 行，悬停卡片 | 该 Session 所在仓库的完整药丸 |
| Files 面板，目录操作行 | 面板当前目录对应的药丸 |
| Conversation → `git-log` | 本 Session 最近 20 条提交，打开标签时抓取 |

全部内容都是叠加的 —— 不替换、也不隐藏任何现有的 DSH 元素。非仓库、目录不存在
或探测出错时，干脆不显示标签，而不是显示一个错的。

### 状态配色

| 状态 | 颜色 |
| --- | --- |
| 工作区干净 | 🟢 绿色 `state-success-primary` |
| 工作区有改动 | 🟠 琥珀色 `state-warn-primary` |
| 非仓库，或目录不存在 | ⚪ 灰色 `state-idle-primary` |
| 探测出错 | 🔴 红色 `state-error-primary` |

所有位置共用同一套映射，因此分支在组头、面板和悬停卡片里颜色一致。`↑/↓` 上游
计数保持它自己的品牌色 —— 领先/落后与工作区是否脏是两件不同的事实。

### 安装 / 卸载

```
plugin_manager install_bundle  <此目录的绝对路径>
plugin_manager remove_bundle   @local/dsh-git-status
```

安装与重新启用通过 HMR 生效；禁用会移除标签并停止轮询。

[↑ 返回顶部](#dsh-git-status--dsh-工作区实时-git-分支指示器)

</details>
