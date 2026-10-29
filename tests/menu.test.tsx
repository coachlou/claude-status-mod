import { test, expect } from 'claude-code/testing'

test('desktop draws icons and the folder and branch pickers', async ($, on) => {
  on('session.cwd', () => ({ value: '/r' }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/r\n/r/.git\n/r/.git\nmain\n', stderr: '' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  // stands in for the engine's own band (empty) beneath the plugin
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })

  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'git-branch-band', surface: 'desktop', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ key: 'git-branch' })).toBeDefined()
  expect(await ui.find({ key: 'git-folder' })).toBeDefined()
  await ui.unmount()
})

test('terminal draws glyphs; a cloud session in a linked worktree shows the worktree icon, its folder and its branch', async ($, on) => {
  on('session.cwd', () => ({ value: '/w/feat' }))
  on('env.get', () => ({ value: 'true' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/w/feat\n/r/.git/worktrees/feat\n/r/.git\nfeat-x\n', stderr: '' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })

  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'git-branch-band', surface: 'terminal', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/w/feat', surface: 'terminal', isInteractive: true })
  expect(await ui.find({ type: 'Text', text: /⌥/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /☁/ })).toBeDefined()
  expect(await ui.find({ key: 'git-branch' })).toBeDefined()
  await ui.unmount()
})

test('picking a branch runs git switch; picking a folder runs /cd', async ($, on) => {
  on('session.cwd', () => ({ value: '/p/r' }))
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [{ name: 'other', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  const runs: string[] = []
  on('process.run', (_$, e) => {
    runs.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: e.argv[1] === 'branch' ? 'main\ndev\n' : '/p/r\n/p/r/.git\n/p/r/.git\nmain\n', stderr: '' } }
  })
  const cds: string[] = []
  on('command.run', (_$, e) => { cds.push(`${e.command} ${e.args}`); return { text: '' } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })

  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'git-branch-band', surface: 'desktop', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/p/r', surface: 'desktop', isInteractive: true })
  await ui.select({ key: 'git-branch', value: 'dev' })
  expect(runs).toContain('git switch dev')
  await ui.select({ key: 'git-folder', value: '/p/other' })
  expect(cds).toEqual(['cd /p/other'])
  await ui.unmount()
})
