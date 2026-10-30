// The free demo: one fake subagent per design, spawned 1.5s apart, each running for a
// while with its numbers climbing; the Ninja fails so the grey crab shows too. No model
// is called. A real run that starts meanwhile takes over: the demo's timers stand down.

import type { EngineInterface } from 'claude-code'

import type { AgentRow } from '../types'
import { costOf } from './model'
import { KEEP, openPane, readMain, setNow, updateAgents, updateMain } from './state'

export const DEMO_TITLE = 'Demo: six crabs at work'

// The demo's timers fire on their own; a refused write ends one quietly.
const quietly = (work: Promise<unknown>) => void work.catch(() => undefined)

/**
 * Removes the demo while the band still shows it: its run goes back to the one it took the
 * band from, then its agents go. The run goes first, so a spawn timer mid-flight sees the
 * demo gone and stands down rather than adding a row after the sweep.
 */
export async function clearDemo($: EngineInterface) {
  await updateMain($, m => {
    if (m.title !== DEMO_TITLE) return m
    const back = m.beforeDemo
    const isRealTurn = m.isWorking && m.demoId === undefined
    return {
      ...m,
      demoId: undefined,
      beforeDemo: undefined,
      title: back?.title,
      runStartedAt: back?.runStartedAt,
      isWorking: isRealTurn,
      turnStartedAt: isRealTurn ? m.turnStartedAt : (back?.turnStartedAt ?? 0),
    }
  })
  await updateAgents($, list => list.filter(a => !a.isDemo))
}

const DEMO: { description: string; type: string; model: string; effort: string; ms: number; fails?: true }[] = [
  { description: 'Scout the repo layout', type: 'Explore', model: 'claude-haiku-5-5', effort: 'low', ms: 9000 },
  { description: 'Plunder the test logs', type: 'general-purpose', model: 'claude-sonnet-5-5', effort: 'medium', ms: 11000 },
  { description: 'Sneak through the API types', type: 'Explore', model: 'claude-opus-5-5', effort: 'high', ms: 8000, fails: true },
  { description: 'Guard the build config', type: 'general-purpose', model: 'claude-opus-5-5', effort: 'max', ms: 13000 },
  { description: 'Tune the sprite timings', type: 'general-purpose', model: 'claude-sonnet-5-5', effort: 'high', ms: 10000 },
  { description: 'Paint the band colours', type: 'general-purpose', model: 'claude-opus-5-5', effort: 'xhigh', ms: 12000 },
]

/** How long the demo plays, start to Done, in milliseconds. */
export const DEMO_MS = Math.max(...DEMO.map((d, i) => i * 1500 + d.ms)) + 1500

export async function runDemo($: EngineInterface) {
  const start = await $.clock.now()
  const isCurrent = async () => (await readMain($)).demoId === start

  await updateAgents($, list => list.filter(a => !a.isDemo))
  await updateMain($, m => ({
    ...m,
    // The run the band showed before, kept for `clear`; a replay keeps the first one's.
    beforeDemo:
      m.title === DEMO_TITLE
        ? m.beforeDemo
        : { runStartedAt: m.runStartedAt, turnStartedAt: m.turnStartedAt, title: m.title },
    isWorking: true,
    turnStartedAt: start,
    runStartedAt: start,
    demoId: start,
    title: DEMO_TITLE,
  }))
  await setNow($, start)
  quietly(openPane($))

  DEMO.forEach((d, i) => {
    const id = `demo-${start}-${i}`
    $.clock.after(i * 1500, () => {
      quietly(
        (async () => {
          if (!(await isCurrent())) return
          const at = await $.clock.now()
          const row: AgentRow = {
            id,
            agentId: id,
            description: d.description,
            subagentType: d.type,
            model: d.model,
            effort: d.effort,
            design: i,
            status: 'running',
            isBackground: i % 2 === 1,
            isDemo: true,
            startedAt: at,
            tokens: 0,
            costUsd: 0,
            contextTokens: 0,
            steps: 0,
            toolCalls: 0,
          }
          await updateAgents($, list => [...list, row].slice(-KEEP))
          // Cleared while this row went in: take it back out.
          if (!(await isCurrent())) await updateAgents($, list => list.filter(a => a.id !== id))
        })(),
      )
    })
    $.clock.after(i * 1500 + d.ms, () => {
      quietly(
        (async () => {
          const at = await $.clock.now()
          await updateAgents($, list =>
            list.map((a): AgentRow => (a.id === id ? { ...a, status: d.fails ? 'failed' : 'done', endedAt: at } : a)),
          )
        })(),
      )
    })
  })

  // Numbers climb once a second while any demo agent runs.
  const tick = $.clock.every(1000, () => {
    quietly(
      updateAgents($, list =>
        list.map((a): AgentRow => {
          if (!a.isDemo || a.status !== 'running') return a
          const tokens = 15_000 + Math.round(Math.random() * 25_000)
          return {
            ...a,
            steps: a.steps + 1,
            toolCalls: a.toolCalls + (Math.random() < 0.6 ? 1 : 0),
            tokens: a.tokens + tokens,
            costUsd:
              a.costUsd +
              costOf(a.model, { input_tokens: 0, output_tokens: 2000, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 }),
            contextTokens: Math.min(900_000, a.contextTokens + 6000 + Math.round(Math.random() * 14_000)),
          }
        }),
      ),
    )
  })

  $.clock.after(DEMO_MS, () => {
    tick.cancel()
    quietly(updateMain($, m => (m.demoId === start ? { ...m, isWorking: false, demoId: undefined } : m)))
  })
}
