import type { AgentStatus as EngineAgentStatus, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const band = (isWorking: boolean) =>
  ({
    plugin: 'progress-bar',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  }) as const

const PANE = {
  plugin: 'progress-bar',
  component: 'Pane',
  requestId: 'progress-bar',
  surface: 'desktop',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

/** The engine beneath the plugin, as much of it as these tests touch. */
function engine(on: On, title = 'Polish the progress bar') {
  const clock = mock.clock(on, { now: 1_000 })
  const asked: string[] = []
  const listed: { id: string; status: EngineAgentStatus }[] = []
  on('command.register', () => ({ value: { command: 'progress-bar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  // The engine's own drawing, for a band the plugin hands back.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('agent.spawn', (_, e) => ({ model: 'claude-opus-5-5', agentId: `agent-${e.tool_use_id}` }))
  on('agent.list', () => ({ value: listed.map(a => ({ ...a, description: a.id, type: 'Explore' })) }))
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: `"${title}."`, usage: USAGE } }
  })
  return { clock, asked, listed }
}

const USAGE = { input_tokens: 40, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

const say = ($: Engine, text: string, kind: 'sdk' | 'task-notification' = 'sdk') =>
  $.prompt.submit({ text, wait: false, origin: { kind }, ...(kind === 'sdk' ? {} : { isMeta: true }) })

const mainTurn = ($: Engine, id: string) => $.turn.start({ text: '', turnId: id })

const endMain = ($: Engine, id: string) =>
  $.turn.complete({ answer: '', durationMs: 1_000, isAborted: false, turnId: id, reason: 'answer' })

const spawn = ($: Engine, id: string, description = `Task ${id}`) =>
  $.agent.spawn({
    tool_use_id: id,
    prompt: 'Do the thing.',
    description,
    subagentType: 'Explore',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })

const endAgent = ($: Engine, id: string, reason: 'answer' | 'aborted' = 'answer') =>
  $.turn.complete({
    answer: 'done',
    durationMs: 500,
    isAborted: reason === 'aborted',
    turnId: `turn-${id}`,
    agentId: `agent-${id}`,
    reason,
  })

async function bandAlt($: Engine, isWorking: boolean) {
  const ui = await $.ui.mount(band(isWorking))
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return svg === undefined ? undefined : String(svg.props.alt)
}

test('a prompt names its run with a short work title, not its own words', async ($, on) => {
  const { clock, asked } = engine(on, 'Polish the progress bar')
  await start($)
  await say($, 'can you make the dots fill the bar and keep the pill one size?\nthanks')
  await clock.settle()
  await mainTurn($, 't1')

  expect(asked).toHaveLength(1)
  expect(await bandAlt($, true)).toBe('Polish the progress bar: working')
})

test('a message sent while work runs joins that run and keeps its title', async ($, on) => {
  const { clock, asked } = engine(on, 'Polish the progress bar')
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await say($, 'oh and make it green when done')
  await clock.settle()

  expect(asked).toHaveLength(1)
  expect(await bandAlt($, true)).toBe('Polish the progress bar: working')
})

test('notifications and slash commands begin no run', async ($, on) => {
  const { clock, asked } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await endMain($, 't1')
  await say($, '<task-notification>agent finished</task-notification>', 'task-notification')
  await $.prompt.submit({ text: '/progress-bar demo', wait: false, origin: { kind: 'sdk' }, command: { name: 'progress-bar', args: 'demo' } })
  await clock.settle()

  expect(asked).toHaveLength(1)
})

test('with work titles off, the prompt\'s first line names the run and no model is asked', { options: { workTitles: false } }, async ($, on) => {
  const { clock, asked } = engine(on)
  await start($)
  await say($, 'Fix the band alignment\nit is off by a few pixels')
  await clock.settle()
  await mainTurn($, 't1')

  expect(asked).toHaveLength(0)
  expect(await bandAlt($, true)).toBe('Fix the band alignment: working')
})

test('a run counts its own subagents, ends Done, and the next run starts from zero', async ($, on) => {
  const { clock } = engine(on, 'Polish the progress bar')
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')
  await spawn($, 'b')
  await endAgent($, 'a')
  expect(await bandAlt($, true)).toBe('Polish the progress bar: 1 of 2 done, 50%')

  await endAgent($, 'b')
  await endMain($, 't1')
  expect(await bandAlt($, false)).toBe('Polish the progress bar: done')

  await clock.advance(1_000)
  await say($, 'now write the readme')
  await clock.settle()
  await mainTurn($, 't2')
  expect(await bandAlt($, true)).toBe('Polish the progress bar: working')
})

test('a finished agent woken again runs a second round', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'a', 'Scout the repo')
  await endAgent($, 'a')
  await $.turn.start({ text: 'one more thing', turnId: 'turn-a2', agentId: 'agent-a' })

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /round 2/ }))?.text).toMatch(/round 2/)
  expect(await ui.find({ type: 'Text', text: /Running · 1/ })).toBeDefined()
  await ui.unmount()
})

test('an interrupted agent shows as stopped, not failed', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'a', 'Scout the repo')
  await endAgent($, 'a', 'aborted')

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Scout the repo/ }))?.text).toBe('■ Scout the repo')
  await ui.unmount()
})

test('an agent whose end went unheard settles from the engine\'s agent list', async ($, on) => {
  const { clock, listed } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await spawn($, 'a')
  listed.push({ id: 'agent-a', status: 'running' })
  await clock.advance(5_000)
  expect(await bandAlt($, false)).toMatch(/0 of 1 done/)

  listed[0]!.status = 'completed'
  await clock.advance(5_000)
  expect(await bandAlt($, false)).toMatch(/: done$/)
})

test('/clear empties the band and the pane', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'a')
  await endAgent($, 'a')
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })

  expect(await bandAlt($, false)).toBeUndefined()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined()
  await ui.unmount()
})
