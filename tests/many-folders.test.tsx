import { test, expect } from 'claude-code/testing'

test('a parent with more folders than Select allows still draws the band', async ($, on) => {
  on('session.cwd', () => ({ value: '/p/zz-me' }))
  on('env.get', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.list', () => ({ value: Array.from({ length: 107 }, (_, i) => ({ name: `d${i}`, kind: 'dir' })) }))
  on('process.run', (_$, e) => ({ value: { exitCode: 0, stdout: e.argv[1] === 'branch' ? 'main\n' : '/p/zz-me\n/p/zz-me/.git\n/p/zz-me/.git\nmain\n', stderr: '' } }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box /> })
  const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'git-branch-band', surface: 'desktop', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/p/zz-me', surface: 'desktop', isInteractive: true })
  expect(await ui.find({ key: 'git-folder' })).toBeDefined()
  expect(await ui.find({ key: 'git-branch' })).toBeDefined()
  await ui.unmount()
})
