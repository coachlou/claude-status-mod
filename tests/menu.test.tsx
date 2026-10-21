import { test, expect } from 'claude-code/testing'

test('menu icon after the branch opens the sample menu; a pick toasts and closes it', async ($, on) => {
  on('session.root', () => ({ value: '/r' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/r\n/r/.git\n/r/.git\nmain\n', stderr: '' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  // stands in for the engine's own band (empty) beneath the plugin
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  const toasts: string[] = []
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })

  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'git-branch-band', surface: 'desktop', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/r', surface: 'desktop', isInteractive: true })
  expect(await ui.find({ text: /⎇ main/ })).toBeDefined()
  expect(await ui.find({ key: 'git-menu:.aai init' })).toBeUndefined()

  await ui.press({ key: 'git-menu' })
  expect(await ui.find({ key: 'git-menu:.aai init' })).toBeDefined()
  expect(await ui.find({ key: 'git-menu:dev scaffold' })).toBeDefined()

  await ui.press({ key: 'git-menu:pull' })
  expect(toasts).toEqual(['Would run: pull'])
  expect(await ui.find({ key: 'git-menu:pull' })).toBeUndefined()
  await ui.unmount()
})
