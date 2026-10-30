import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register } from 'claude-code'

import type { AgentRow, MainState, PanelState } from '../types'
import { DESIGNS, agentSprite, bandBar, barSprite, mainSprite, plainSprite } from './sprites'

const PANE = 'progress-bar'
const TITLE = 'Agents'
const KEEP = 60

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const agents = atom({ plugin: 'progress-bar', key: 'agents' } as const, [] as AgentRow[], {
  shape: 'agents-1',
})
const main = atom(
  { plugin: 'progress-bar', key: 'main' } as const,
  { isWorking: false, turnStartedAt: 0, workMs: 0, tokens: 0, costUsd: 0, model: '' } as MainState,
  { shape: 'main-1' },
)
const now = atom({ plugin: 'progress-bar', key: 'now' } as const, 0)
const panel = atom({ plugin: 'progress-bar', key: 'panel' } as const, { isDoneCollapsed: false } as PanelState)

// Dollars per million tokens: input, output, cache read, cache write (writes at 1.25x input).
type Price = [number, number, number, number]
const OPUS_5_5: Price = [4, 20, 0.2, 5]
const PRICES: [RegExp, Price][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, OPUS_5_5],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet-5/, [2, 10, 0.2, 2.5]],
  [/sonnet/, [3, 15, 0.3, 3.75]],
  [/haiku-5/, [0.1, 0.5, 0.01, 0.125]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

const costOf = (model: string, u: ModelUsage): number => {
  const [i, o, rd, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? OPUS_5_5
  return (
    (u.input_tokens * i + u.output_tokens * o + u.cache_read_input_tokens * rd + u.cache_creation_input_tokens * w) /
    1e6
  )
}

const tokensOf = (u: ModelUsage) =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

const windowOf = (model: string) => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

/** `claude-opus-5-5[1m]` reads as `Opus 5.5`. */
const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id || 'model'
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number) => `≈$${usd >= 10 ? usd.toFixed(1) : usd.toFixed(2)}`

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsedOf = (a: AgentRow, at: number) => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: TITLE })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'progress-bar',
      description: 'Open the Agents pane: every subagent with its crab, model, context, cost and time',
    })

    // Ticks the clocks once a second, quiet while nothing works.
    $.clock.every(1000, () => {
      void (async () => {
        const [list, m] = await Promise.all([read($, agents), read($, main)])
        if (!m.isWorking && !list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'progress-bar' }, async $ => {
    await openPane($)
    return { text: 'Agents pane opened.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const at = await $.clock.now()
      // A continuation has no typed text: it keeps the title of the prompt it continues.
      const title = e.text.trim().split('\n')[0]?.slice(0, 80)
      await update($, main, m => ({ ...m, isWorking: true, turnStartedAt: at, title: title || m.title }))
      await update($, now, () => at)
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    const list = await read($, agents)
    const isFirstRunning = !list.some(a => a.status === 'running')
    const row: AgentRow = {
      id: started.agentId ?? e.tool_use_id,
      agentId: started.agentId,
      description: e.description || e.subagentType,
      subagentType: e.subagentType,
      model: started.model || e.model || e.parentModel,
      design: ((list.at(-1)?.design ?? -1) + 1) % DESIGNS.length,
      status: 'running',
      isBackground: e.background,
      startedAt: at,
      tokens: 0,
      costUsd: 0,
      contextTokens: 0,
      steps: 0,
      toolCalls: 0,
    }
    await update($, agents, prev => [...prev, row].slice(-KEEP))
    await update($, now, () => at)
    if (isFirstRunning) void openPane($)

    return started
  }).catch(($, e, next) => next(e)) // a failure here only loses the row, never the spawn

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (!u) return result

    const model = u.model || e.model
    const cost = costOf(model, u)
    const tokens = tokensOf(u)
    const effort = e.effort === undefined ? undefined : String(e.effort)

    if (e.agentId === undefined) {
      await update($, main, m => ({
        ...m,
        model,
        effort,
        tokens: m.tokens + tokens,
        costUsd: m.costUsd + cost,
      }))
    } else {
      const agentId = e.agentId
      await update($, agents, list =>
        list.map(a =>
          a.agentId !== agentId
            ? a
            : {
                ...a,
                model,
                effort,
                steps: a.steps + 1,
                toolCalls: a.toolCalls + result.toolUses.length,
                tokens: a.tokens + tokens,
                costUsd: a.costUsd + cost,
                contextTokens: tokens,
              },
        ),
      )
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const at = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, main, m => ({ ...m, isWorking: false, workMs: m.workMs + e.durationMs }))
    } else {
      const agentId = e.agentId
      await update($, agents, list =>
        list.map((a): AgentRow => {
          if (a.agentId !== agentId) return a
          // Steps normally carry the usage; a run whose steps went unseen falls back to the turn's sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens: tokensOf(e.usage),
                  costUsd: costOf(e.usage.model || a.model, e.usage),
                }
              : {}),
          }
        }),
      )
    }
    await update($, now, () => at)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const [list, m, p, tick] = await Promise.all([read($, agents), read($, main), read($, panel), read($, now)])
    const at = Math.max(tick, m.turnStartedAt, ...list.map(a => a.startedAt))

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
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
      const mood = a.status === 'running' ? 'working' : a.status === 'done' ? 'done' : 'failed'
      const ctx = a.contextTokens / windowOf(a.model)
      const tail = [
        `ctx ${Math.round(ctx * 100)}%`,
        fmtTokens(a.tokens),
        fmtCost(a.costUsd),
        fmtTime(elapsedOf(a, at)),
      ].join(' · ')
      const who = [DESIGNS[a.design % DESIGNS.length], a.subagentType, modelName(a.model), a.effort]
        .filter(Boolean)
        .join(' · ')
      const textW = Math.max(60, W - 84)

      return (
        <Box key={a.id} flexDirection="row" gap={1} alignItems="center">
          {Svg ? (
            <Svg
              key={`crab-${a.id}-${mood}`}
              source={agentSprite(a.design, mood)}
              alt={`${DESIGNS[a.design % DESIGNS.length]} crab, ${a.status}`}
              width={72}
              height={48}
              isInteractive
            />
          ) : (
            <Text>{a.status === 'running' ? '▶' : a.status === 'done' ? '✓' : '✗'}</Text>
          )}
          <Box flexDirection="column" flexGrow={1}>
            <Text weight="semibold" wrap="truncate-end">
              {a.status === 'done' ? '✓ ' : a.status === 'failed' ? '✗ ' : ''}
              {a.description}
            </Text>
            <Text dimColor size="caption" wrap="truncate-end">
              {who}
              {a.isBackground ? ' · bg' : ''}
            </Text>
            {Svg && (
              <Svg
                key={`bar-${a.id}`}
                source={barSprite(textW, ctx, a.status === 'failed' ? '#9A9A9A' : '#D97757')}
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
            <Text weight="semibold">Main session</Text>
            <Text dimColor size="caption">
              {[modelName(m.model), m.effort].filter(Boolean).join(' · ')}
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
            onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
          />
        )}
        {!p.isDoneCollapsed && finished.map(agentRow)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // No read of `now` here: the band redraws only when work changes, so its shine runs unbroken.
    const [list, m, p] = await Promise.all([read($, agents), read($, main), read($, panel)])
    const running = list.filter(a => a.status === 'running')
    const turn = list.filter(a => a.startedAt >= m.turnStartedAt)
    const isWorking = e.props.isWorking || m.isWorking || running.length > 0
    // Once the turn ends, a turn that had subagents stays up as Done until the next one starts.
    const isDone = !isWorking && turn.length > 0
    if (e.props.hasSurvey || (!isWorking && !isDone) || p.hiddenTurn === m.turnStartedAt) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = 'Svg' in ui ? ui.Svg : undefined

    // The bar fills as this turn's subagents finish.
    const done = turn.filter(a => a.status !== 'running').length
    const fraction = isDone ? 1 : turn.length > 0 ? done / turn.length : 0
    const label = isDone ? 'Done' : turn.length > 0 ? `Agents ${done}/${turn.length}` : 'Working'
    const title = m.title || 'Working'
    const total = (e.props.bodyColumns || 100) * 8
    const titleW = Math.min(title.length * 7.5 + 30, 300)
    const barW = Math.round(Math.max(120, Math.min(640, total - titleW - 170)))
    const accent = isDone ? '#5BBF8A' : '#8B7CF6'

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={accent}>●</Text>
        <Box flexShrink={1}>
          <Text weight="semibold" wrap="truncate-end">
            {title}
          </Text>
        </Box>
        {Svg ? (
          <Svg
            key={`band-bar-${isDone ? 'done' : 'work'}`}
            source={bandBar(barW, fraction, label, isDone, turn.length)}
            alt={isDone ? 'Done' : `${label}, ${Math.round(fraction * 100)}%`}
            width={barW}
            height={20}
            isInteractive={!isDone || undefined}
          />
        ) : (
          <Text color={accent}>{label}</Text>
        )}
        {turn.length > 0 && (
          <Text dimColor tabular>
            {Math.round(fraction * 100)}%
          </Text>
        )}
        {Svg && (
          <Svg
            key={`band-crab-${isDone ? 'done' : 'work'}`}
            source={plainSprite(isDone ? 'done' : 'working')}
            alt={isDone ? 'Crab resting' : 'Crab working'}
            width={28}
            height={20}
            isInteractive
          />
        )}
        <Button key="open-agents" plain label={`×${list.length}`} onPress={() => void openPane($)} />
        <Button
          key="hide-band"
          plain
          label="✕"
          onPress={() => update($, panel, prev => ({ ...prev, hiddenTurn: m.turnStartedAt }))}
        />
      </Box>
    )
  })
}
