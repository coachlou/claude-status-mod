export type GitInfo = { branch: string; worktree: string | null }

declare module 'claude-code' {
  interface PluginState {
    'git-branch-band': { info: GitInfo | null; menuOpen: boolean }
  }
}
