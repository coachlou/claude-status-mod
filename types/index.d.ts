export type GitInfo = { branch: string; worktree: string | null; folder: string; isRemote?: boolean; cwd?: string; folders?: string[]; branches?: string[] }

declare module 'claude-code' {
  interface PluginState {
    'git-branch-band': { info: GitInfo | null }
  }
}
