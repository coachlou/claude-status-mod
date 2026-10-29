import { test, expect, mock } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`strip on ${surface}: countdown, context, usage, ⋯ picker`, { options: { cacheMinutes: 30 } }, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { tokens: 42_000, window: 1_000_000 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 37 }, { kind: 'seven_day', percentUsed: 12 }],
      },
    }))
    on('session.model', () => ({ value: 'Opus 5.5' }))
    on('session.cwd', () => ({ value: '/tmp' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as any
    })
    on('command.register', () => ({ value: { command: 'cache-keeper-brief' } }))
    const notified: string[] = []
    on('ui.notify', (_$, e) => { notified.push(e.text); return { value: { isSent: true, channel: 'terminal_bell' } } })

    const props = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 3 }, view: {} }
    const ui = await $.ui.mount({ plugin: 'cache-keeper', surface, component: 'AbovePrompt', props })
    expect(await ui.find({ text: /↻—/ })).toBeDefined()
    expect(JSON.stringify(await ui.find({ key: 'handoff' }))).not.toContain('"Clear"')

    await $.session.start({ cwd: '/tmp', surface, isInteractive: true })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(await ui.find({ text: /↻30:00/ })).toBeDefined()
    expect(await ui.find({ text: / 42k\/1M / })).toBeDefined()
    expect(await ui.find({ text: /📁/ })).toBeUndefined()
    expect(await ui.find({ text: /^⏱16m/ })).toBeDefined()
    expect(await ui.find({ text: /Opus/ })).toBeUndefined()
    expect(await ui.find({ text: /37%h 12%w/ })).toBeDefined()
    expect(JSON.stringify(await ui.find({ key: 'handoff' }))).toContain('"Clear"')

    await clock.advance(25 * 60_000)
    expect(notified.length).toBe(1)
    expect(await ui.find({ text: /↻5:00/ })).toBeDefined()
    await clock.advance(5 * 60_000)
    expect(await ui.find({ text: /↻cold/ })).toBeDefined()
    await ui.unmount()
  })
}

test('Handoff & Clear: brief → store → /clear → fill', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.cwd', () => ({ value: '/tmp' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', () => ({ value: { command: 'cache-keeper-brief' } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'Goal: X. Next: Y.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  const store: Record<string, unknown> = {}
  on('store.set', (_$, e) => { store[e.key] = e.value; return { value: undefined } })
  const ran: string[] = []
  on('command.run', (_$, e) => { ran.push(e.command); return { text: '' } })
  const filled: string[] = []
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  on('ui.toast', () => ({ value: undefined }))

  const props = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 3 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'terminal', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await ui.select({ key: 'handoff', value: 'go' })
  expect(ran).toEqual(['clear'])
  expect(filled[0]).toMatch(/^Handoff brief from the previous session:\n\nGoal: X/)
  expect(store['cache-keeper.handoff']).toBe(filled[0])
  await ui.unmount()
})

test('Nest (desktop): brief → prompt box request, no /clear', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.cwd', () => ({ value: '/tmp' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('command.register', () => ({ value: { command: 'cache-keeper-brief' } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: '# Fix the band\nGoal: X.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  on('store.set', () => ({ value: undefined }))
  const ran: string[] = []
  on('command.run', (_$, e) => { ran.push(e.command); return { text: '' } })
  const filled: string[] = []
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  on('ui.toast', () => ({ value: undefined }))

  const props = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 3 }, view: {} }
  const ui = await $.ui.mount({ plugin: 'cache-keeper', surface: 'desktop', component: 'AbovePrompt', props })
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await ui.select({ key: 'handoff', value: 'new' })
  expect(ran).toEqual([])
  expect(filled[0]).toMatch(/^Start a nested session titled "Fix the band"/)
  expect(filled[0]).toContain('Handoff brief from the previous session:')
  await ui.unmount()
})
