import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GitInfo } from '../types'

const info = atom({ plugin: 'git-branch-band', key: 'info' } as const, null)

// Lucide git-branch / git-fork; stroke hard-coded because Svg draws isolated and never sees the theme's currentColor
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
const LAPTOP_SVG = svg('<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>')
const CLOUD_SVG = svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>')
const FOLDER_SVG = svg('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>')
const BRANCH_SVG = svg('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>')
const WORKTREE_SVG = svg('<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>')

// the engine refuses a Select of more than 64 options, and with it the whole band
const MAX_OPTIONS = 64

// ponytail: refreshed at session start and after each turn, not polled; a checkout typed in another terminal shows after the next turn
async function refresh($: EngineInterface) {
  const cwd = await $.session.cwd()
  // ponytail: cloud sessions set CLAUDE_CODE_REMOTE; no $ API names the session's host
  const isRemote = (await $.env.get('CLAUDE_CODE_REMOTE')) === 'true'
  const folder = cwd.split('/').pop() || cwd
  const r = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir', '--abbrev-ref', 'HEAD'],
    { cwd, timeoutMs: 5000 },
  ).catch(() => null)
  // not a git repo (or git failed): say so rather than hide the line
  // ponytail: folder picker lists the parent's other folders only, cut to Select's 64-option cap; a tree browser when one level is not enough
  const parent = cwd.slice(0, cwd.lastIndexOf('/')) || '/'
  const siblings = await $.fs.list(parent).catch(() => [])
  const folders = [...new Set([cwd, ...siblings.filter(f => f.kind === 'dir' && !f.name.startsWith('.')).map(f => `${parent === '/' ? '' : parent}/${f.name}`)])].slice(0, MAX_OPTIONS)
  let next: GitInfo | null = { branch: 'no repo', worktree: null, folder, isRemote, cwd, folders, branches: [] }
  if (r && r.exitCode === 0) {
    const [top = '', gitDir, commonDir, ref = 'HEAD'] = r.stdout.trim().split('\n')
    const name = top.split('/').pop() || top
    // a linked worktree has its own git dir apart from the shared one
    const worktree = gitDir !== commonDir ? name : null
    // detached HEAD: name it by its worktree (or checkout folder), never the commit id
    const b = await $.process.run(['git', 'branch', '--format=%(refname:short)'], { cwd, timeoutMs: 5000 }).catch(() => null)
    const branches = b && b.exitCode === 0 ? [...new Set(b.stdout.split('\n').filter(Boolean))].slice(0, MAX_OPTIONS) : []
    next = { branch: ref === 'HEAD' ? worktree ?? name : ref, worktree, folder, isRemote, cwd, folders, branches }
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
    // a plugin loaded mid-session gets no session.start: fetch on first draw (the write redraws)
    if (git === null) void refresh($).catch(err => $.ui.toast(`git-branch-band: ${String(err)}`))
    if (e.props.hasSurvey || git === null) return next(e)

    // the band holds one tree: what the plugins beneath drew goes under row 1; the ⋯ menu is cache-keeper's (it draws outermost)
    const below = await next(e).catch(() => null)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // the terminal has no Svg element (its table still answers the key), so it gets a glyph
    const icon = (svg: string, glyph: string, alt: string) =>
      e.surface !== 'terminal' && 'Svg' in els ? <els.Svg source={svg} alt={alt} width={16} height={16} /> : <Text dimColor>{glyph} </Text>
    const switchTo = async (branch: string) => {
      if (branch === git.branch) return
      const r = await $.process.run(['git', 'switch', branch], { cwd: git.cwd ?? (await $.session.cwd()), timeoutMs: 10000 }).catch(() => null)
      // a dirty tree is the usual refusal: show git's own words
      if (!r || r.exitCode !== 0) $.ui.toast(r?.stderr.trim() || `git switch ${branch} failed`)
      await refresh($)
    }
    const cd = async (path: string) => {
      if (path === git.cwd) return
      await $.command.run({ command: 'cd', args: path }).catch(err => $.ui.toast(`Could not cd: ${String(err)}`))
      await refresh($)
    }
    // a surface whose table has no Select keeps the plain text
    const Select = 'Select' in els ? els.Select : null
    const folders = Select && git.folders?.length ? git.folders : null
    const branches = Select && git.branches?.includes(git.branch) ? git.branches : null
    return (
      <Box flexDirection="column" rowGap="xs">
        <Box gap={2}>
          {git.isRemote ? icon(CLOUD_SVG, '☁', 'cloud') : icon(LAPTOP_SVG, '⌂', 'computer')}
          <Box>
            {icon(FOLDER_SVG, '▤', 'folder')}
            {Select && folders ? (
              <Select key="git-folder" value={git.cwd} options={folders.map(p => ({ value: p, label: p.split('/').pop() || p }))} onSelect={(p: string) => void cd(p)} />
            ) : <Text dimColor> {git.folder ?? ''}</Text>}
          </Box>
          <Box>
            {icon(git.worktree ? WORKTREE_SVG : BRANCH_SVG, git.worktree ? '⌥' : '\ue0a0', git.worktree ? 'worktree' : 'branch')}
            {Select && branches ? (
              <Select key="git-branch" value={git.branch} options={branches.map(b => ({ value: b }))} onSelect={(b: string) => void switchTo(b)} />
            ) : <Text dimColor>{` ${git.branch}`}</Text>}
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}
