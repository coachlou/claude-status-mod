import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Cache } from '../types'

const MIN = 60_000
const WARN_MS = 5 * MIN
const BRIEF_KEY = 'cache-keeper.handoff'

const k = (n: number | undefined) =>
  n == null ? '—' : n < 1000 ? `${n}` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ponytail: whole minutes; the 1s tick that redraws it only runs while the cache is warm.
const elapsed = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / MIN))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const cache = atom({ plugin: 'cache-keeper', key: 'cache' } as const, { warmAt: null, ttlMs: 60 * MIN, isDetected: false } as Cache)
const now = atom({ plugin: 'cache-keeper', key: 'now' } as const, 0)
const busy = atom({ plugin: 'cache-keeper', key: 'busy' } as const, false)
// ponytail: git-branch-band's sample menu lives in this ⋯ picker because no API orders the band's plugins and this one draws outermost; each item only toasts
const MENU = ['status', 'pull', 'push', 'commit', 'diff', 'log', 'switch', 'stash', '.aai init', 'dev scaffold']

// Module-level: a reload drops these with the environment; session.start re-arms from $.state.
let tick: Timer | undefined
let warn: Timer | undefined
let warnedFor = 0

async function arm($: EngineInterface, warmAt: number, ttlMs: number) {
  warn?.cancel()
  tick?.cancel()
  tick = $.clock.every(1000, async () => {
    const t = await $.clock.now()
    await update($, now, () => t)
    if (t >= warmAt + ttlMs) tick?.cancel()
  })
  const lead = warmAt + ttlMs - WARN_MS - (await $.clock.now())
  if (lead <= 0 || warnedFor === warmAt) return
  warn = $.clock.after(lead, () => {
    warnedFor = warmAt
    void $.ui.notify('Prompt cache goes cold in 5 minutes. Send a message to keep it warm.', { title: 'Cache Keeper' })
  })
}

async function mark($: EngineInterface, ttlMs?: number) {
  const warmAt = await $.clock.now()
  const next = await update($, cache, c => ({ ...c, warmAt, ttlMs: ttlMs ?? c.ttlMs }))
  await arm($, warmAt, next.ttlMs)
}

export const register: Register = (on, options) => {
  const configuredMs = Number(options.cacheMinutes ?? 60) * MIN

  on('session.start', async ($, e, next) => {
    // a reload or restart mid-handoff would leave the picker stuck on "writing…"
    await update($, busy, () => false)
    await $.command.register({ name: 'cache-keeper-brief', description: 'Paste the last saved handoff brief into the prompt' })
    await update($, cache, c => ({ ...c, ttlMs: c.isDetected ? c.ttlMs : configuredMs }))
    const c = await read($, cache)
    if (c.warmAt) await arm($, c.warmAt, c.ttlMs) // reload: timers were dropped, state kept
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await mark($)
    return next(e)
  })

  // The engine reports the real window here; prefer it over the configured one.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const ttl = e.cache_ttl === '5m' ? 5 * MIN : e.cache_ttl === '1h' ? 60 * MIN : undefined
    if (ttl) await update($, cache, c => ({ ...c, ttlMs: ttl, isDetected: true }))
    if (e.prompt_cache_warm) await mark($, ttl)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if ('seconds_since_last_response' in e && !e.prompt_cache_likely_expired) {
      const warmAt = (await $.clock.now()) - (e.seconds_since_last_response ?? 0) * 1000
      const c = await update($, cache, c => ({ ...c, warmAt }))
      await arm($, warmAt, c.ttlMs)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      warn?.cancel()
      tick?.cancel()
      await update($, cache, c => ({ ...c, warmAt: null }))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Select } = $.ui.resolve(e)
    const [c, t, isBusy, u] = await Promise.all([
      read($, cache), read($, now), read($, busy), $.session.usage(),
    ])
    const nowMs = t || (await $.clock.now())

    const left = c.warmAt ? c.warmAt + c.ttlMs - nowMs : null
    const cacheText = left === null ? '↻—' : left <= 0 ? '↻cold' : `↻${mmss(left)}`
    const cacheColor = left === null ? undefined : left <= 0 ? 'red' : left <= WARN_MS ? 'yellow' : 'green'

    const tokens = u.context.tokens
    const pct = (kind: string) => {
      const p = u.rateLimits?.find(r => r.kind === kind)?.percentUsed
      return p == null ? '—' : `${Math.round(p)}%`
    }

    // 'clear' wipes this session and pastes the brief; 'new' leaves it and starts a linked session with the brief
    const handoff = async (to: 'clear' | 'new') => {
      if (await read($, busy)) return
      await update($, busy, () => true)
      try {
        const r = await $.model.fork({
          prompt:
            'Write a handoff brief for a fresh session that has none of this context. Include: the goal, what has been done (files, commands, decisions), what remains, open questions, and the exact next step. Markdown, under 400 words. Output only the brief.',
        })
        if (!r.isAnswered) {
          $.ui.toast(`Handoff failed: ${r.reason}`)
          return
        }
        const brief = `Handoff brief from the previous session:\n\n${r.text.trim()}`
        await $.store.set(BRIEF_KEY, brief)
        if (to === 'new') {
          // auto mode refuses a plugin's own start_session, so Nest fills the box and the person sends the request
          const title = (r.text.split('\n').find(l => l.trim()) ?? 'Handoff').replace(/^#+\s*/, '').slice(0, 58)
          const { isFilled } = await $.prompt.fill({
            text: `Start a nested session titled "${title}" (start_session, initiation user_asked, context fresh) whose prompt is exactly this handoff brief:\n\n${brief}`,
          })
          $.ui.toast(isFilled ? 'Nest request in the prompt box. Press Enter to start the nested chat.' : 'Brief saved; /cache-keeper-brief pastes it.')
          return
        }
        await $.command.run({ command: 'clear' })
        let { isFilled } = await $.prompt.fill({ text: brief })
        if (!isFilled) {
          // ponytail: the box may not be rebuilt yet right after /clear; one retry.
          await $.clock.sleep(500)
          isFilled = (await $.prompt.fill({ text: brief })).isFilled
        }
        $.ui.toast(isFilled ? 'Handoff brief pasted. Press Enter to send it.' : 'Session cleared. Brief saved; run /cache-keeper-brief to paste it.')
      } finally {
        await update($, busy, () => false)
      }
    }

    // the ⋯ picker: sample items, each only toasts
    const options = [{ value: 'menu', label: '⋯' }, ...MENU.map(item => ({ value: item }))]
    const pick = (item: string) => { if (item !== 'menu') $.ui.toast(`Would run: ${item}`) }
    // Handoff stays in view; a picker, not a Button (desktop draws those tall), and its second click confirms the /clear
    const canHandoff = !e.props.isWorking && c.warmAt !== null && !isBusy
    const handoffOptions = [
      { value: 'idle', label: isBusy ? '⇄ writing…' : '⇄ Handoff' },
      ...(canHandoff ? [{ value: 'go', label: 'Clear' }] : []),
      // starting a session needs the desktop app's tool
      ...(canHandoff && e.surface === 'desktop' ? [{ value: 'new', label: 'Nest' }] : []),
    ]

    // the band holds one tree: keep whatever the plugins beneath (git-branch-band) drew
    const below = await next(e).catch(() => null)
    return (
      // rowGap "xs": none on the terminal, a little room on desktop where pickers stand taller than a text line
      <Box flexDirection="column" rowGap="xs">
        {below}
        <Box gap={1}>
        <Select key="menu" value="menu" options={options} onSelect={(v: string) => pick(v)} />
        {/* ponytail: one line by design — ↻ is the cache countdown, then context used/window, then 5h/weekly usage */}
        <Text dimColor>{`⏱${elapsed(nowMs - u.startedAt)} `}</Text>
        <Text color={cacheColor}>{cacheText}</Text>
        <Text dimColor>{` ${k(tokens)}/${k(u.context.window)} ${pct('five_hour')}h ${pct('seven_day')}w`}</Text>
        <Select key="handoff" value="idle" options={handoffOptions} onSelect={(v: string) => { if (v === 'go') void handoff('clear'); else if (v === 'new') void handoff('new') }} />
        </Box>
      </Box>
    )
  })

  on('command.run', { command: 'cache-keeper-brief' }, async ($, e) => {
    const brief = await $.store.get(BRIEF_KEY)
    if (typeof brief !== 'string') return { text: 'No handoff brief saved yet.' }
    const { isFilled } = await $.prompt.fill({ text: brief })
    return { text: isFilled ? 'Handoff brief pasted into the prompt.' : brief }
  })
}
