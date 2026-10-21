# git-branch-band

A Claude Code mod that shows the current git branch above the prompt (or the worktree's name when no branch is checked out, or `no repo`), with a `⋯` button that opens a sample command menu. The menu items only show a toast for now.

It shares the band above the prompt with other mods: whatever the mods beneath it drew is kept below its line.

## Install

At the prompt of a terminal session:

```
/plugin install git-branch-band --marketplace coachlou/claude-status-mod
```

From a shell:

```bash
claude plugin install git-branch-band --marketplace coachlou/claude-status-mod
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `coachlou/claude-status-mod`, then Add plugin.
