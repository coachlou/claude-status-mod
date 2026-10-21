import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'

const info = atom({ plugin: 'git-branch-band', key: 'info' } as const, null)
const menuOpen = atom({ plugin: 'git-branch-band', key: 'menuOpen' } as const, false)

// ponytail: sample menu, each item only toasts; wire real actions when the layout is settled
const MENU = ['status', 'pull', 'push', 'commit', 'diff', 'log', 'switch', 'stash', '.aai init', 'dev scaffold']

// ponytail: refreshed at session start and after each turn, not polled; a checkout typed in another terminal shows after the next turn
async function refresh($: EngineInterface) {
  const cwd = await $.session.root()
  const r = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir', '--abbrev-ref', 'HEAD'],
    { cwd, timeoutMs: 5000 },
  ).catch(() => null)
  // not a git repo (or git failed): say so rather than hide the line
  let next: GitInfo | null = { branch: 'no repo', worktree: null }
  if (r && r.exitCode === 0) {
    const [top = '', gitDir, commonDir, ref = 'HEAD'] = r.stdout.trim().split('\n')
    const name = top.split('/').pop() || top
    // a linked worktree has its own git dir apart from the shared one
    const worktree = gitDir !== commonDir ? name : null
    // detached HEAD: name it by its worktree (or checkout folder), never the commit id
    next = { branch: ref === 'HEAD' ? worktree ?? name : ref, worktree }
  }
  await update($, info, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await refresh($)
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const git = await read($, info)
    if (e.props.hasSurvey || git === null) return next(e)

    // the band holds one tree: draw ours above whatever the plugins beneath (cache-keeper) drew
    const below = await next(e).catch(() => null)
    const { Box, Text, Button } = $.ui.resolve(e)
    const isOpen = await read($, menuOpen)
    const pick = async (item: string) => {
      await update($, menuOpen, () => false)
      $.ui.toast(`Would run: ${item}`)
    }
    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>
            ⎇ {git.branch}
            {git.worktree && git.worktree !== git.branch ? `  ·  worktree: ${git.worktree}` : ''}
            {'  '}
          </Text>
          <Button key="git-menu" label={isOpen ? '▾' : '⋯'} onPress={() => void update($, menuOpen, o => !o)} />
        </Box>
        {isOpen ? (
          <Box flexWrap="wrap" gap={1}>
            {MENU.map(item => (
              <Button key={`git-menu:${item}`} label={item} onPress={() => void pick(item)} />
            ))}
          </Box>
        ) : null}
        {below}
      </Box>
    )
  })
}
