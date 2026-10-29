import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'

const info = atom({ plugin: 'git-branch-band', key: 'info' } as const, null)
const menuOpen = atom({ plugin: 'git-branch-band', key: 'menuOpen' } as const, false)

// ponytail: sample menu, each item only toasts; wire real actions when the layout is settled
// Lucide git-branch / git-fork; stroke hard-coded because Svg draws isolated and never sees the theme's currentColor
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const LAPTOP_SVG = svg('<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>')
const FOLDER_SVG = svg('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>')
const BRANCH_SVG = svg('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>')
const WORKTREE_SVG = svg('<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>')

const MENU = ['status', 'pull', 'push', 'commit', 'diff', 'log', 'switch', 'stash', '.aai init', 'dev scaffold']

// ponytail: refreshed at session start and after each turn, not polled; a checkout typed in another terminal shows after the next turn
async function refresh($: EngineInterface) {
  const cwd = await $.session.root()
  const r = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir', '--abbrev-ref', 'HEAD'],
    { cwd, timeoutMs: 5000 },
  ).catch(() => null)
  // not a git repo (or git failed): say so rather than hide the line
  let next: GitInfo | null = { branch: 'no repo', worktree: null, folder: cwd.split('/').pop() || cwd }
  if (r && r.exitCode === 0) {
    const [top = '', gitDir, commonDir, ref = 'HEAD'] = r.stdout.trim().split('\n')
    const name = top.split('/').pop() || top
    // a linked worktree has its own git dir apart from the shared one
    const worktree = gitDir !== commonDir ? name : null
    // detached HEAD: name it by its worktree (or checkout folder), never the commit id
    next = { branch: ref === 'HEAD' ? worktree ?? name : ref, worktree, folder: name }
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
      e.surface !== 'terminal' && 'Svg' in els ? <els.Svg source={svg} alt={alt} width={16} height={16} /> : <Text dimColor>{glyph} </Text>
    const isOpen = await read($, menuOpen)
    const pick = async (item: string) => {
      await update($, menuOpen, () => false)
      $.ui.toast(`Would run: ${item}`)
    }
    return (
      <Box flexDirection="column">
        {/* mirrors the app's own row under the prompt: computer · folder · branch */}
        <Box gap={2}>
          <Box>{icon(LAPTOP_SVG, '⌂', 'computer')}<Text dimColor> This computer</Text></Box>
          <Box>{icon(FOLDER_SVG, '▤', 'folder')}<Text dimColor> {git.folder ?? ''}</Text></Box>
          <Box>
            {icon(git.worktree ? WORKTREE_SVG : BRANCH_SVG, git.worktree ? '⌥' : '⎇', git.worktree ? 'worktree' : 'branch')}
            <Text dimColor>{' '}</Text>
            <Text dimColor>{git.branch}</Text>
          </Box>
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
