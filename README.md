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

## More mods in this marketplace

- **cache-keeper**: a row above the prompt with elapsed time, a prompt-cache countdown, context size, 5h and weekly usage, and a Handoff picker. Clear writes a handoff brief, clears the chat and pastes the brief back. Nest (desktop) fills the prompt box with a request to start a nested session from the brief.
- **notetaker**: keeps a cleaned-up markdown record of the conversation in `~/.claude/notetaker/`, per chat or as one thread across chats, plus a distilled insights file, shown in a side pane. `/notes` controls it.

Install either the same way, with its name in place of `git-branch-band`:

```bash
claude plugin install cache-keeper --marketplace coachlou/claude-status-mod
```

```bash
claude plugin install notetaker --marketplace coachlou/claude-status-mod
```
