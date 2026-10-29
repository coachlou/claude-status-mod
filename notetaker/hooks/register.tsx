import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { NotetakerMode, NotetakerView } from '../types'

const PANE = 'notetaker'
let DIR = '' // ~/.claude/notetaker, set by ensure() before any note path is built
const SYNTH_EVERY = 5 // noted exchanges between insight refreshes
const notes = atom({ plugin: 'notetaker', key: 'notes' } as const, '')
const insights = atom({ plugin: 'notetaker', key: 'insights' } as const, '')
const file = atom({ plugin: 'notetaker', key: 'file' } as const, '')
const pending = atom({ plugin: 'notetaker', key: 'pending' } as const, '')
const mode = atom({ plugin: 'notetaker', key: 'mode' } as const, 'chat' as NotetakerMode)
const view = atom({ plugin: 'notetaker', key: 'view' } as const, 'notes' as NotetakerView)
const isNewChat = atom({ plugin: 'notetaker', key: 'isNewChat' } as const, false)
const sinceSynth = atom({ plugin: 'notetaker', key: 'sinceSynth' } as const, 0)

const SYSTEM = `You are a notetaker. Turn ONE exchange between a user (Lou) and an AI assistant into a clean record other people or agents can reuse as handoff context or raw teaching material.
Write terse markdown. Keep only substance: what was asked, decisions made and why, facts established, key reasoning, open questions, next actions. Drop pleasantries, tool chatter, retries and dead ends (unless the dead end is instructive). Use concrete specifics; never invent anything not in the exchange.
Then, only if the exchange holds something that transfers beyond this project to AI-passionate knowledge entrepreneurs (coaches, consultants, course creators building with AI) — a methodology, mental model, cognitive move or reframe, AI-workflow pattern, or quotable insight — add up to 2 lines, each starting "> 💡 ", stating it as a portable lesson. Most exchanges have none; never force one.
Output format: a "### " heading naming the topic in a few words, then bullets, then any 💡 lines. Under 150 words. If nothing durable happened, output exactly: SKIP`

const SYNTH = `You distill working notes into teachable insight for AI-passionate knowledge entrepreneurs (coaches, consultants, course creators building with AI): Lou's AIMM members.
You get your PRIOR distillation and the latest NOTES. Return the full updated distillation: keep what still holds, merge duplicates, sharpen wording, add what's new. Extract only what transfers beyond the specific project. Sections (omit any that is empty):
## Patterns — recurring problems and the moves that solve them
## Methodologies — repeatable processes, step sequences, frameworks
## Cognitive perspectives — mental models, reframes, ways of seeing that changed the outcome
## Teachable nuggets — crisp one-liners or before/after contrasts worth quoting
## Content angles — possible AIMM teaching blocks, posts or demos, one line each
Concrete bullets grounded only in the notes; end each with the source note heading in (parentheses). No preamble.`

const HELP = `/notes           open the pane
/notes thread    keep ONE file across chats (this chat's file becomes the thread)
/notes chat      give each new chat its own file (default)
/notes new       start a fresh file now
/notes insights  refresh the insights file now and show it
/notes view      flip the pane between notes and insights`

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
const newPath = () => `${DIR}/${stamp().replace(/[: ]/g, '-')}.md`
const insightsPath = (path: string) => path.replace(/\.md$/, '.insights.md')
const open = ($: any) => $.ui.open({ id: PANE, title: 'Notetaker' })
const readDisk = async ($: any, path: string) =>
  (await $.fs.exists(path)) ? String(await $.fs.read(path)) : ''

// A rewind (or resume) starts a new session that carries the old prompts, so the chat is
// recognized by its prompts, not its session id. Each noted prompt maps to its notes file.
// ponytail: text hash, so the same long prompt in two chats links them; 2,000 newest kept.
const MIN_ANCHOR = 20
const hash = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
const remember = async ($: any, prompt: string, path: string) => {
  if (prompt.trim().length < MIN_ANCHOR) return
  const anchors = ((await $.store.get('anchors')) ?? []) as [string, string][]
  await $.store.set('anchors', [...anchors, [hash(prompt.trim()), path]].slice(-2000))
}
// Newest earlier prompt of this session that a notes file already holds.
const lineage = async ($: any) => {
  const anchors = new Map(((await $.store.get('anchors')) ?? []) as [string, string][])
  if (anchors.size === 0) return undefined
  const prompts = (await $.session.messages())
    .filter((m: any) => m.role === 'user' && m.text.trim().length >= MIN_ANCHOR)
    .reverse()
  for (const m of prompts) {
    const path = anchors.get(hash(m.text.trim()))
    if (path) return path
  }
  return undefined
}
const adopt = async ($: any, path: string, divider: boolean) => {
  await update($, file, () => path)
  const text = await readDisk($, path)
  await update($, notes, () => text)
  const ins = await readDisk($, insightsPath(path))
  await update($, insights, () => ins)
  await update($, isNewChat, () => divider)
}

// Rewrites <notes>.insights.md from the prior distillation plus the notes tail.
const synth = async ($: any, path: string) => {
  const ipath = insightsPath(path)
  const prior = await readDisk($, ipath)
  // ponytail: tail cap; prior distillation carries older material forward. Map-reduce if that loses too much.
  const src = (await readDisk($, path)).slice(-80_000)
  const r = await $.model.complete({
    model: 'sonnet',
    system: SYNTH,
    prompt: `PRIOR:\n${prior || '(none)'}\n\nNOTES:\n${src}`,
    maxTokens: 2500,
  })
  if (!r.isAnswered) return false
  const text = `# Insights — ${path.split('/').pop()}\n_Updated ${stamp()}_\n\n${r.text.trim()}\n`
  await $.fs.write(ipath, text)
  await update($, insights, () => text)
  await update($, sinceSynth, () => 0)
  return true
}

// Once per session id: picks up mode/thread from the store and opens the pane.
// Module-level, so a hot reload (new module) and a /clear (new id) both re-run it.
let seen = ''
const ensure = async ($: any) => {
  DIR ||= `${await $.env.get('HOME')}/.claude/notetaker`
  const id = await $.session.id()
  if (id === seen) return
  seen = id
  if ((await read($, file)) === '') {
    const m = ((await $.store.get('mode')) ?? 'chat') as NotetakerMode
    const thread = (await $.store.get('thread')) as string | undefined
    await update($, mode, () => m)
    const same = await lineage($)
    if (same) await adopt($, same, false) // rewound or resumed: same chat, same file
    else if (m === 'thread' && thread) await adopt($, thread, true)
  }
  void open($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'notes',
      description: 'Live notetaker pane; thread | chat | new | insights | view',
      argumentHint: '[thread|chat|new|insights|view]',
    })
    await ensure($)
    return next(e)
  })

  // /clear starts a new session (atoms reset) but fires no session.start, so the first prompt re-inits.
  on('prompt.submit', async ($, e, next) => {
    await ensure($)
    if (!e.command && !e.isMeta) await update($, pending, () => e.text)
    return next(e)
  })

  on('command.run', { command: 'notes' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const path = await read($, file)

    if (arg === 'thread') {
      await $.store.set('mode', 'thread')
      await update($, mode, () => 'thread')
      if (path) await $.store.set('thread', path)
      else await $.store.delete('thread') // first note of this chat creates the thread file
      return { text: `Thread mode on. New chats continue ${path || 'the file this chat starts'}.` }
    }
    if (arg === 'chat') {
      await $.store.set('mode', 'chat')
      await update($, mode, () => 'chat')
      return { text: `Per-chat mode on. This chat keeps ${path || 'its own file'}; new chats get their own.` }
    }
    if (arg === 'new') {
      await update($, file, () => '')
      await update($, notes, () => '')
      await update($, insights, () => '')
      await update($, sinceSynth, () => 0)
      await update($, isNewChat, () => false)
      if ((await read($, mode)) === 'thread') await $.store.delete('thread')
      return { text: 'Fresh notes file starts with the next exchange.' }
    }
    if (arg === 'insights') {
      if (!path) return { text: 'No notes yet to distill.' }
      const ok = await synth($, path)
      await update($, view, () => 'insights')
      await open($)
      return { text: ok ? `Insights refreshed: ${insightsPath(path)}` : 'Insight synthesis failed; try again.' }
    }
    if (arg === 'view') {
      const v = (await read($, view)) === 'notes' ? 'insights' : 'notes'
      await update($, view, () => v)
      await open($)
      return { text: `Pane shows ${v}.` }
    }
    await open($)
    return { text: `Mode: ${await read($, mode)}. File: ${path || '(starts with first exchange)'}\n${HELP}` }
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer') return out
    const user = await read($, pending)
    if (!user && !e.answer) return out

    // ponytail: one haiku call per turn; batch every N turns if cost matters
    const r = await $.model.complete({
      model: 'haiku',
      system: SYSTEM,
      prompt: `USER:\n${user}\n\nASSISTANT:\n${e.answer}`,
      maxTokens: 600,
    })
    const entry = r.isAnswered
      ? r.text.trim()
      : `### (raw, summarizer failed)\n- User: ${user.slice(0, 400)}\n- Assistant: ${e.answer.slice(0, 600)}`
    await update($, pending, () => '')
    if (entry === 'SKIP') return out

    let path = await read($, file)
    if (!path) {
      const same = await lineage($) // history may land after session.start
      if (same) {
        await adopt($, same, false)
        path = same
      }
    }
    if (!path) {
      path = newPath()
      await update($, file, () => path)
      if ((await read($, mode)) === 'thread') await $.store.set('thread', path)
    }
    // Re-read from disk so two chats sharing a thread append instead of overwriting each other.
    // ponytail: read-append-write, not locked; two chats finishing in the same instant can drop one entry
    let text = (await readDisk($, path)) || `# Conversation notes — ${stamp().slice(0, 10)}\n`
    if (await read($, isNewChat)) {
      text += `\n---\n## New chat — ${stamp()}\n`
      await update($, isNewChat, () => false)
    }
    text += `\n${entry}\n`
    await $.fs.write(path, text)
    await update($, notes, () => text)
    await remember($, user, path)

    // Awaited $ calls don't count against the hook's budget (reference: "Work that outlives a dispatch").
    if ((await update($, sinceSynth, n => n + 1)) >= SYNTH_EVERY) await synth($, path)
    return out
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, view)
    const n = await read($, notes)
    const ins = await read($, insights)
    const text = v === 'notes' ? n : ins
    const path = await read($, file)
    const m = await read($, mode)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)
    // Notes follow the live tail; insights are a document, so show from the top.
    const all = text.split('\n')
    const lines = v === 'notes' ? all.slice(-room) : all.slice(0, room)
    const empty = v === 'notes'
      ? 'Waiting for the first exchange to finish…'
      : `No insights yet: they refresh every ${SYNTH_EVERY} noted exchanges, or run /notes insights.`
    return (
      <Box flexDirection="column">
        {text === '' && <Text dimColor>{empty}</Text>}
        {lines.map(l => (
          <Text bold={l.startsWith('#')} color={l.startsWith('> 💡') ? 'yellow' : undefined}>{l}</Text>
        ))}
        <Text dimColor>
          {v} · {m === 'thread' ? 'thread (continues across chats)' : 'per chat'}
          {path !== '' ? ` · ${v === 'notes' ? path : insightsPath(path)}` : ''}
        </Text>
      </Box>
    )
  })
}
