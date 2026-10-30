import type {
  AgentSpawnInput,
  AgentStatus as EngineAgentStatus,
  EngineInterface,
  PromptSubmitInput,
  Register,
  TurnCompleteInput,
  TurnStepInput,
  TurnUsage,
} from 'claude-code'

import type { AgentRow, AgentStatus } from '../types'
import { DEMO_MS, DEMO_TITLE, clearDemo, runDemo } from './demo'
import { costOf, fmtCost, fmtTime, fmtTokens, modelName, tokensOf, windowOf } from './model'
import { BAND_H, DESIGNS, agentSprite, bandRow, barSprite, mainSprite } from './sprites'
import type { CrabMood } from './sprites'
import {
  EMPTY_MAIN,
  KEEP,
  openPane,
  readAgents,
  readMain,
  readNow,
  isPending,
  readPanel,
  runStart,
  setNow,
  togglePane,
  updateAgents,
  updateMain,
  updatePanel,
} from './state'
import { nameRun } from './title'

// The person's own prompts: typed in the terminal or the app (which arrives as its SDK
// host's), or sent from a phone. Notifications, schedules and other sessions are not.
const PERSON = new Set(['composer', 'sdk', 'bridge'])
// Finished rows the pane draws until the person asks for all of them.
const FINISHED_SHOWN = 8
// How long a run may wait for its first turn before the band stops calling it working.
const PENDING_MS = 30_000
// How the engine's agent list names an agent that is no longer running.
const SETTLED: Partial<Record<EngineAgentStatus, AgentStatus>> = {
  completed: 'done',
  failed: 'failed',
  killed: 'stopped',
}
const MARK: Record<AgentStatus, string> = { running: '', done: '✓ ', failed: '✗ ', stopped: '■ ' }

const moodOf = (s: AgentStatus): CrabMood => (s === 'running' ? 'working' : s)
// Work started and not awaited (a press, a pane opened on the side): another plugin's
// refusal ends it quietly, never as a rejection nothing handles.
const quietly = (work: Promise<unknown>) => void work.catch(() => undefined)
const elapsedOf = (a: AgentRow, at: number) => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

// Module memory, which a reload empties: agents the engine's list has shown, and the
// ends heard before their spawn's row was written.
const listed = new Set<string>()
const endedEarly = new Map<string, AgentStatus>()

/** A run begun by a prompt the engine has not yet taken, and what it replaced. */
type Begun = {
  at: number
  text: string
  before: { runStartedAt?: number; title?: string }
  /** The title of the work before, which a follow-up keeps. */
  previousTitle?: string
}

/**
 * The person's prompt begins a new run when nothing is working; one sent mid-run, or before
 * the run's first turn, joins it. The run starts at once, so the band shows it as the prompt
 * goes in; `settleRun` keeps or undoes it once the engine says whether the prompt entered.
 */
async function beginRun($: EngineInterface, e: PromptSubmitInput): Promise<Begun | undefined> {
  if (e.isMeta || e.command !== undefined || !PERSON.has(e.origin.kind) || e.text.trim() === '') return undefined
  const [list, m] = await Promise.all([readAgents($), readMain($)])
  const isBusy =
    (m.isWorking && m.demoId === undefined) || isPending(m) || list.some(a => a.status === 'running' && !a.isDemo)
  if (isBusy) return undefined

  const at = await $.clock.now()
  await updateMain($, prev => ({ ...prev, runStartedAt: at, title: undefined }))
  return {
    at,
    text: e.text,
    before: { runStartedAt: m.runStartedAt, title: m.title },
    previousTitle: m.demoId === undefined && m.title !== DEMO_TITLE ? m.title : undefined,
  }
}

/**
 * Once the engine has the prompt. Dropped (a hook refused it), the run it began is undone and
 * the band shows the run before. Entered, the run stands: a demo it interrupted ends, and the
 * work is named off this dispatch, so the prompt never waits on the model.
 */
async function settleRun($: EngineInterface, begun: Begun, isDropped: boolean, useModel: boolean) {
  if (isDropped) {
    await updateMain($, m => (m.runStartedAt === begun.at ? { ...m, ...begun.before } : m))
    return
  }
  await updateMain($, m =>
    m.runStartedAt === begun.at
      ? { ...m, demoId: undefined, beforeDemo: undefined, isWorking: m.demoId === undefined ? m.isWorking : false }
      : m,
  )
  await updateAgents($, rows => rows.filter(a => !a.isDemo))
  $.clock.after(0, () => void nameRun($, begun.text, begun.at, begun.previousTitle, useModel).catch(() => undefined))
}

async function startTurn($: EngineInterface, agentId: string | undefined) {
  const at = await $.clock.now()
  if (agentId === undefined) {
    await updateMain($, m => ({ ...m, isWorking: true, turnStartedAt: at, demoId: undefined }))
  } else {
    // A finished agent woken again (a message to it, a resume) runs another round.
    await updateAgents($, list =>
      list.map((a): AgentRow =>
        a.agentId === agentId && a.status !== 'running'
          ? { ...a, status: 'running', endedAt: undefined, rounds: (a.rounds ?? 1) + 1 }
          : a,
      ),
    )
  }
  await setNow($, at)
}

async function addAgent($: EngineInterface, e: AgentSpawnInput, model: string, agentId: string | undefined, autoOpen: boolean) {
  const at = await $.clock.now()
  const list = await readAgents($)
  const early = agentId === undefined ? undefined : endedEarly.get(agentId)
  const row: AgentRow = {
    id: agentId ?? e.tool_use_id,
    agentId,
    description: e.description || e.subagentType,
    subagentType: e.subagentType,
    model: model || e.model || e.parentModel,
    design: ((list.at(-1)?.design ?? -1) + 1) % DESIGNS.length,
    status: early ?? 'running',
    endedAt: early === undefined ? undefined : at,
    isBackground: e.background,
    startedAt: at,
    tokens: 0,
    costUsd: 0,
    contextTokens: 0,
    steps: 0,
    toolCalls: 0,
  }
  await updateAgents($, prev => [...prev.filter(a => a.id !== row.id), row].slice(-KEEP))
  await setNow($, at)
  if (autoOpen && !list.some(a => a.status === 'running' && !a.isDemo)) quietly(openPane($))
}

async function addUsage($: EngineInterface, e: TurnStepInput, u: TurnUsage, toolCalls: number) {
  const model = u.model || e.model
  const cost = costOf(model, u)
  const tokens = tokensOf(u)
  const effort = e.effort === undefined ? undefined : String(e.effort)
  if (e.agentId === undefined) {
    await updateMain($, m => ({ ...m, model, effort, tokens: m.tokens + tokens, costUsd: m.costUsd + cost }))
    return
  }
  const agentId = e.agentId
  await updateAgents($, list =>
    list.map((a): AgentRow =>
      a.agentId !== agentId
        ? a
        : {
            ...a,
            model,
            effort,
            steps: a.steps + 1,
            toolCalls: a.toolCalls + toolCalls,
            tokens: a.tokens + tokens,
            costUsd: a.costUsd + cost,
            contextTokens: tokens,
          },
    ),
  )
}

async function endTurn($: EngineInterface, e: TurnCompleteInput) {
  const at = await $.clock.now()
  if (e.agentId === undefined) {
    await updateMain($, m => ({ ...m, isWorking: false, workMs: m.workMs + e.durationMs }))
  } else {
    const agentId = e.agentId
    const status: AgentStatus = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
    let isFound = false
    await updateAgents($, list =>
      list.map((a): AgentRow => {
        if (a.agentId !== agentId) return a
        isFound = true
        // Steps normally carry the usage; a run whose steps went unseen falls back to the turn's sum.
        const fallback = a.steps === 0 ? e.usage : undefined
        return {
          ...a,
          status,
          endedAt: at,
          ...(fallback
            ? {
                model: fallback.model || a.model,
                tokens: tokensOf(fallback),
                costUsd: costOf(fallback.model || a.model, fallback),
              }
            : {}),
        }
      }),
    )
    // An end heard before the spawn's row was written: the row starts out ended.
    if (!isFound) endedEarly.set(agentId, status)
  }
  await setNow($, at)
}

/** Settles running rows the engine's agent list shows have ended, when their end went unheard. */
async function reconcile($: EngineInterface, at: number) {
  const infos = await $.agent.list()
  const statusOf = new Map(infos.map(i => [i.id, i.status]))
  await updateAgents($, list =>
    list.map((a): AgentRow => {
      if (a.status !== 'running' || a.isDemo || a.agentId === undefined) return a
      const status = statusOf.get(a.agentId)
      // Gone from a list it was on: the engine dropped it a while after it ended.
      const settled = status === undefined ? (listed.has(a.agentId) ? 'done' : undefined) : SETTLED[status]
      return settled ? { ...a, status: settled, endedAt: at } : a
    }),
  )
  for (const id of statusOf.keys()) listed.add(id)
}

/** Once a second: moves the clocks while anything works, and every fifth, checks the agent list. */
async function tick($: EngineInterface, shouldCheck: boolean) {
  const [list, m] = await Promise.all([readAgents($), readMain($)])
  const running = list.filter(a => a.status === 'running')
  if (!m.isWorking && running.length === 0 && !isPending(m)) return
  const at = await $.clock.now()
  // A run whose first turn never came (another hook dropped its prompt) stops waiting.
  const start = runStart(m)
  if (isPending(m) && at - start > PENDING_MS) {
    await updateMain($, x => (isPending(x) && runStart(x) === start ? { ...x, turnStartedAt: start } : x))
  }
  await setNow($, at)
  if (shouldCheck && running.some(a => !a.isDemo && a.agentId !== undefined)) await reconcile($, at)
}

async function resetAll($: EngineInterface) {
  await updateAgents($, () => [])
  await updateMain($, m => ({ ...EMPTY_MAIN, model: m.model, effort: m.effort }))
  await updatePanel($, p => ({ ...p, showAllDone: false }))
  listed.clear()
  endedEarly.clear()
}

export const register: Register = (on, options) => {
  const autoOpen = options.autoOpenPane !== false
  const workTitles = options.workTitles !== false

  on('session.start', async ($, e, next) => {
    // A refused command costs the command alone: the clock below must start either way.
    await $.command
      .register({
        name: 'progress-bar',
        description:
          'Open the Agents pane: every subagent with its crab, model, context, cost and time. `demo` plays a free demo, `clear` removes it',
        argumentHint: 'demo | clear',
      })
      .catch(() => undefined)
    let ticks = 0
    $.clock.every(1000, () => {
      ticks += 1
      void tick($, ticks % 5 === 0).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'progress-bar' }, async ($, e) => {
    // `[demo]` too: an argument hint can show brackets, and people type what they see.
    const arg = e.args.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').trim()
    if (arg === 'demo') {
      await runDemo($)
      return {
        text: `Playing the progress-bar demo: six crabs, about ${Math.round(DEMO_MS / 1000)} seconds, no model calls.`,
      }
    }
    if (arg === 'clear') {
      await clearDemo($)
      return { text: 'Demo cleared.' }
    }
    await openPane($)
    return { text: 'Agents pane opened. `/progress-bar demo` plays a free demo.' }
  })

  // Every hook below does its bookkeeping inside a catch and then hands on: a slip in
  // this mod can cost a row or a number, never a prompt, a spawn or a turn.

  on('prompt.submit', async ($, e, next) => {
    const begun = await beginRun($, e).catch(() => undefined)
    // Resolves once the prompt's turn started, or it was queued, or a hook dropped it.
    const entered = await next(e)
    if (begun) await settleRun($, begun, entered.drop !== undefined, workTitles).catch(() => undefined)
    return entered
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await startTurn($, e.agentId).catch(() => undefined)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny === undefined) {
      await addAgent($, e, started.model, started.agentId, autoOpen).catch(() => undefined)
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.usage) await addUsage($, e, result.usage, result.toolUses.length).catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    await endTurn($, e).catch(() => undefined)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await resetAll($).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'progress-bar' }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The terminal's table lists an Svg too but hands it on as an empty box: there the words stand in.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
    const [list, m, p, tick] = await Promise.all([readAgents($), readMain($), readPanel($), readNow($)])
    const at = Math.max(tick, m.turnStartedAt, ...list.map(a => a.startedAt))

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const shown = p.showAllDone ? finished : finished.slice(0, FINISHED_SHOWN)
    const W = Math.max(220, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
    const totalCost = m.costUsd + list.reduce((s, a) => s + a.costUsd, 0)
    const totalTokens = m.tokens + list.reduce((s, a) => s + a.tokens, 0)
    const workMs = m.workMs + (m.isWorking ? at - m.turnStartedAt : 0)

    const stat = (key: string, label: string, value: string) => (
      <Box key={key} flexDirection="column" flexGrow={1} paddingX={1} borderStyle="round" borderDimColor>
        <Text dimColor size="caption">
          {label}
        </Text>
        <Text weight="semibold" tabular>
          {value}
        </Text>
      </Box>
    )

    const agentRow = (a: AgentRow) => {
      const mood = moodOf(a.status)
      const ctx = a.contextTokens / windowOf(a.model)
      const tail = [`ctx ${Math.round(ctx * 100)}%`, fmtTokens(a.tokens), fmtCost(a.costUsd), fmtTime(elapsedOf(a, at))].join(
        ' · ',
      )
      const who = [
        DESIGNS[a.design % DESIGNS.length],
        a.subagentType,
        modelName(a.model),
        a.effort,
        (a.rounds ?? 1) > 1 ? `round ${a.rounds}` : undefined,
        a.isBackground ? 'bg' : undefined,
      ]
        .filter(Boolean)
        .join(' · ')
      const textW = Math.max(60, W - 84)

      return (
        <Box key={a.id} flexDirection="row" gap={1} alignItems="center">
          {Svg ? (
            // Only a working crab moves, so only it needs a live frame; the rest draw as images.
            <Svg
              key={`crab-${a.id}-${mood}`}
              source={agentSprite(a.design, mood)}
              alt={`${DESIGNS[a.design % DESIGNS.length]} crab, ${a.status}`}
              width={72}
              height={50}
              isInteractive={mood === 'working' || undefined}
            />
          ) : (
            <Text>{a.status === 'running' ? '▶' : MARK[a.status]}</Text>
          )}
          <Box flexDirection="column" flexGrow={1}>
            <Text weight="semibold" wrap="truncate-end">
              {MARK[a.status]}
              {a.description}
            </Text>
            <Text dimColor size="caption" wrap="truncate-end">
              {who}
            </Text>
            {Svg && (
              <Svg
                key={`bar-${a.id}`}
                source={barSprite(textW, ctx, a.status === 'running' || a.status === 'done' ? '#D97757' : '#9A9A9A')}
                alt={`context ${Math.round(ctx * 100)}%`}
                width={textW}
                height={6}
              />
            )}
            <Text dimColor size="caption" tabular>
              {tail}
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1}>
          {stat('cost', 'Cost', fmtCost(totalCost))}
          {stat('tokens', 'Tokens', fmtTokens(totalTokens))}
          {stat('time', 'Time', fmtTime(workMs))}
        </Box>

        <Box flexDirection="row" gap={1} alignItems="center">
          {Svg ? (
            <Svg
              key={`main-${m.isWorking ? 'work' : 'idle'}`}
              source={mainSprite(m.isWorking)}
              alt={m.isWorking ? 'Main crab typing on its laptop' : 'Main crab dozing'}
              width={104}
              height={48}
              isInteractive
            />
          ) : (
            <Text>{m.isWorking ? '⌨' : 'z'}</Text>
          )}
          <Box flexDirection="column" flexGrow={1}>
            <Text weight="semibold" wrap="truncate-end">
              {m.title ?? 'Main session'}
            </Text>
            <Text dimColor size="caption">
              {['Main session', modelName(m.model), m.effort].filter(Boolean).join(' · ')}
            </Text>
            <Text dimColor size="caption" tabular>
              {m.isWorking ? `Working · ${fmtTime(at - m.turnStartedAt)}` : 'Idle'} · {fmtCost(m.costUsd)}
            </Text>
          </Box>
        </Box>

        {list.length === 0 && <Text dimColor>No subagents yet. They show up here as Claude spawns them.</Text>}

        {running.length > 0 && (
          <Text weight="semibold" size="footnote">
            Running · {running.length}
          </Text>
        )}
        {running.map(agentRow)}

        {finished.length > 0 && (
          <Button
            key="toggle-done"
            plain
            label={`${p.isDoneCollapsed ? '▸' : '▾'} Finished · ${finished.length}`}
            onPress={() => quietly(updatePanel($, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed })))}
          />
        )}
        {!p.isDoneCollapsed && shown.map(agentRow)}
        {!p.isDoneCollapsed && finished.length > FINISHED_SHOWN && (
          <Button
            key="toggle-all"
            plain
            label={p.showAllDone ? 'Show fewer' : `Show all ${finished.length}`}
            onPress={() => quietly(updatePanel($, prev => ({ ...prev, showAllDone: !prev.showAllDone })))}
          />
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // No read of `now` here: the band redraws only when the work changes, so its shine runs unbroken.
    const [list, m, p] = await Promise.all([readAgents($), readMain($), readPanel($)])
    const start = runStart(m)
    const run = list.filter(a => a.startedAt >= start)
    const isWorking = e.props.isWorking || m.isWorking || isPending(m) || list.some(a => a.status === 'running')
    // Nothing to show before the session's first run. From then on the band stays: once
    // nothing works it shows that run as Done, subagents or not, until the next one begins.
    if (e.props.hasSurvey || (!isWorking && start === 0)) return next(e)
    const isDone = !isWorking

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Folded, the band is its ▲ alone, run after run, until the person opens it again. It
    // sits at the right end, where the ▼ that folded it was.
    if (p.isBandCollapsed) {
      return (
        <Box flexDirection="row" justifyContent="flex-end" width="100%">
          <Button
            key="band-toggle"
            plain
            label="▲"
            onPress={() => quietly(updatePanel($, prev => ({ ...prev, isBandCollapsed: false })))}
          />
        </Box>
      )
    }
    // The terminal's table lists an Svg too but hands it on as an empty box: there the words stand in.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined

    const done = run.filter(a => a.status !== 'running').length
    const title = m.title ?? 'Working'
    const percent = run.length > 0 ? Math.round(((isDone ? run.length : done) / run.length) * 100) : 0
    const state = isDone ? 'done' : run.length > 0 ? `${done} of ${run.length} done, ${percent}%` : 'working'
    // The dot, title, bar, percent and crab are one drawing, so they share a middle line;
    // the two buttons sit at the right end, the ▼ exactly where a folded band's ▲ is.
    const rowW = Math.round(Math.max(260, Math.min(1100, (e.props.bodyColumns || 100) * 8 - 90)))

    return (
      <Box flexDirection="row" flexWrap="nowrap" justifyContent="space-between" alignItems="center" width="100%">
        {Svg ? (
          <Svg
            key={`band-${isDone ? 'done' : 'work'}`}
            source={bandRow({ width: rowW, title, done, total: run.length, isDone })}
            alt={`${title}: ${state}`}
            width={rowW}
            height={BAND_H}
            isInteractive
          />
        ) : (
          <Text>
            {title} · {state}
          </Text>
        )}
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Button key="open-agents" plain label={`×${list.length}`} onPress={() => quietly(togglePane($))} />
          <Button
            key="band-toggle"
            plain
            label="▼"
            onPress={() => quietly(updatePanel($, prev => ({ ...prev, isBandCollapsed: true })))}
          />
        </Box>
      </Box>
    )
  })
}
