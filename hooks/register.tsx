import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'

const info = atom({ plugin: 'git-branch-band', key: 'info' } as const, null)
const menuOpen = atom({ plugin: 'git-branch-band', key: 'menuOpen' } as const, false)

// ponytail: sample menu, each item only toasts; wire real actions when the layout is settled
// Lucide git-branch / git-fork; stroke hard-coded because Svg draws isolated and never sees the theme's currentColor
const BRANCH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>'
const WORKTREE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>'

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
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // the terminal has no Svg element (its table still answers the key), so it gets a glyph
    const icon = (svg: string, glyph: string, alt: string) =>
      e.surface !== 'terminal' && 'Svg' in els ? <els.Svg source={svg} alt={alt} width={14} height={14} /> : <Text dimColor>{glyph} </Text>
    const isOpen = await read($, menuOpen)
    const pick = async (item: string) => {
      await update($, menuOpen, () => false)
      $.ui.toast(`Would run: ${item}`)
    }
    return (
      <Box flexDirection="column">
        <Box>
          {icon(BRANCH_SVG, '⎇', 'branch')}
          <Text dimColor>{git.branch}</Text>
          {git.worktree ? (
            <>
              <Text>{'  '}</Text>
              {icon(WORKTREE_SVG, '⌥', 'worktree')}
              <Text dimColor>{git.worktree}</Text>
            </>
          ) : null}
          <Text>{'  '}</Text>
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
