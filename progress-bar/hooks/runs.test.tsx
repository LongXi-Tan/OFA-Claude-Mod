import type { AgentStatus as EngineAgentStatus, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'

// The surfaces that draw the band.
const SURFACES = ['terminal', 'desktop'] as const

const band = (isWorking: boolean, surface: (typeof SURFACES)[number] = 'desktop') =>
  ({
    plugin: 'progress-bar',
    component: 'AbovePrompt',
    surface,
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
  // The panes open now, by id: what `$.ui.panes()` answers. One in `unplaced` is open but
  // waits undrawn, as an unasked pane does on a narrow screen; an open asked for places it.
  const panes = new Set<string>()
  const unplaced = new Set<string>()
  // One in `behind` is placed but behind another plugin's tab; an open brings it to the front.
  const behind = new Set<string>()
  const opens: string[] = []
  const closes: string[] = []
  // Another plugin's hook that keeps the pane open, and the prompts a hook drops.
  const rules = { keepsPaneOpen: false }
  const drops = new Set<string>()
  on('command.register', () => ({ value: { command: 'progress-bar' } }))
  on('ui.open', (_, e) => {
    panes.add(e.id)
    unplaced.delete(e.id)
    behind.delete(e.id)
    opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    if (rules.keepsPaneOpen) return { deny: 'kept open by another plugin' }
    panes.delete(e.id)
    closes.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes].map(id => ({
      id,
      title: 'Agents',
      isShown: !behind.has(id),
      isFocused: false,
      isPlaced: !unplaced.has(id),
    })),
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => (drops.has(e.text) ? { drop: 'blocked by a hook' } : { text: e.text }))
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
  return { clock, asked, listed, panes, unplaced, behind, opens, closes, rules, drops }
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

/** What a drawing shows, in order: an Svg by its alt, a Text or a Button by its words. */
async function shows(ui: Pick<Mounted, 'findAll'>) {
  const found = await ui.findAll({})
  return found.filter(el => el.type !== 'Box').map(el => (el.type === 'Svg' ? String(el.props.alt) : el.text))
}

/** The band as a fresh drawing shows it. */
async function bandShows($: Engine, isWorking: boolean) {
  const ui = await $.ui.mount(band(isWorking))
  const shown = await shows(ui)
  await ui.unmount()
  return shown
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

test('a run with no subagents shows Done once it ends, until the next run begins', { options: { workTitles: false } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  expect(await bandAlt($, false)).toBeUndefined()

  await say($, 'Fix the band alignment')
  await clock.settle()
  await mainTurn($, 't1')
  await endMain($, 't1')
  expect(await bandAlt($, false)).toBe('Fix the band alignment: done')
  await clock.advance(60_000)
  expect(await bandAlt($, false)).toBe('Fix the band alignment: done')

  await say($, 'Write the readme')
  await clock.settle()
  await mainTurn($, 't2')
  expect(await bandAlt($, true)).toBe('Write the readme: working')
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

/** The band's drawing, as a fresh mount draws it. */
async function bandSource($: Engine, isWorking: boolean) {
  const ui = await $.ui.mount(band(isWorking))
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return String(svg?.props.source ?? '')
}

test('the bar plays each step from the counts before it: an end forward, a wake back, Done not again', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')
  await clock.advance(1_000)
  await spawn($, 'b')
  await clock.advance(1_000)
  await endAgent($, 'a')
  const ended = await bandSource($, true)
  expect(ended, 'a finished agent').toMatch(/<g class="slide" style="--from:-\d+px">/)
  expect(ended).toMatch(/<g class="grow g\d">/)
  // Its numbers climbing, nothing new to count: the same drawing, so the frame plays on.
  await clock.advance(1_000)
  expect(await bandSource($, true)).toBe(ended)

  await $.turn.start({ text: 'one more thing', turnId: 'turn-a2', agentId: 'agent-a' })
  const woken = await bandSource($, true)
  expect(woken, 'the agent woken again').toMatch(/<g class="slide" style="--from:\d+px">/)
  expect(woken).not.toMatch(/class="grow/)

  await clock.advance(1_000)
  await endAgent($, 'a')
  await clock.advance(1_000)
  await endAgent($, 'b')
  expect(await bandSource($, true)).toMatch(/<g class="slide" style="--from:-\d+px">/)
  await endMain($, 't1')
  const done = await bandSource($, false)
  expect(done).toMatch(/breathe-done/)
  expect(done, 'Done').not.toMatch(/class="(slide|fade|appear|grow[^"]*|tick gone)"/)
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
  await mainTurn($, 't1')
  // A background agent outlives the turn that spawned it.
  await spawn($, 'a')
  await endMain($, 't1')
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

test('×N opens the Agents pane when it is closed, and closes it when it is open', async ($, on) => {
  const { clock, panes } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(true, surface))
    await ui.press({ key: 'open-agents' })
    expect([...panes]).toEqual(['progress-bar'])
    await ui.press({ key: 'open-agents' })
    expect([...panes]).toEqual([])
    await ui.unmount()
  }

  // A pane the first subagent opened by itself closes the same way.
  await spawn($, 'a')
  await clock.settle()
  expect([...panes]).toEqual(['progress-bar'])
  const ui = await $.ui.mount(band(true))
  await ui.press({ key: 'open-agents' })
  expect([...panes]).toEqual([])
  await ui.unmount()
})

test('▼ collapses the band to only ▲, and ▲ brings the full band back', async ($, on) => {
  const { clock } = engine(on, 'Polish the progress bar')
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount(band(true, surface))
    const full = await shows(ui)
    expect(full).toHaveLength(3)
    expect(full[0]).toMatch(/^Polish the progress bar(:| ·) 0 of 1 done, 0%$/)
    expect(full.slice(1)).toEqual(['×1', '▼'])

    await ui.press({ key: 'band-toggle' })
    expect(await shows(ui)).toEqual(['▲'])
    await ui.press({ key: 'band-toggle' })
    expect(await shows(ui)).toEqual(full)
    await ui.unmount()
  }
})

test('a collapsed band stays collapsed into the next run', { options: { workTitles: false } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await say($, 'Polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  const first = await $.ui.mount(band(true))
  await first.press({ key: 'band-toggle' })
  await first.unmount()
  await endMain($, 't1')
  expect(await bandShows($, false)).toEqual(['▲'])

  await clock.advance(1_000)
  await say($, 'Write the readme')
  await clock.settle()
  await mainTurn($, 't2')
  const next = await $.ui.mount(band(true))
  expect(await shows(next)).toEqual(['▲'])
  await next.press({ key: 'band-toggle' })
  expect(await shows(next)).toEqual(['Write the readme: working', '×0', '▼'])
  await next.unmount()
})

const command = ($: Engine, args: string) =>
  $.command.run({ command: 'progress-bar', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

test('a run shows as working, not Done, from the person\'s Enter until its first turn', { options: { workTitles: false } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await say($, 'Polish the bar')
  await clock.settle()
  expect(await bandAlt($, false)).toBe('Polish the bar: working')

  await mainTurn($, 't1')
  await endMain($, 't1')
  expect(await bandAlt($, false)).toBe('Polish the bar: done')
})

test('a run whose first turn never comes stops counting as working after 30 seconds', { options: { workTitles: false } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await say($, 'Polish the bar')
  await clock.settle()
  await clock.advance(20_000)
  expect(await bandAlt($, false)).toBe('Polish the bar: working')

  await clock.advance(15_000)
  expect(await bandAlt($, false)).toBe('Polish the bar: done')
})

test('×N opens a pane that is open but not yet drawn, rather than closing it', async ($, on) => {
  const { clock, panes, unplaced, opens } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  // The first subagent opens the pane by itself, but the screen is too narrow to draw it.
  await spawn($, 'a')
  await clock.settle()
  unplaced.add('progress-bar')
  const before = opens.length

  const ui = await $.ui.mount(band(true))
  await ui.press({ key: 'open-agents' })
  expect(opens).toHaveLength(before + 1)
  expect([...panes]).toEqual(['progress-bar'])
  await ui.unmount()
})

test('/progress-bar clear removes a finished demo and its band', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await command($, 'demo')
  await clock.advance(25_000)
  expect(await bandAlt($, false)).toBe('Demo: six crabs at work: done')

  expect((await command($, 'clear')).text).toBe('Demo cleared.')
  expect(await bandAlt($, false)).toBeUndefined()
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined()
  await ui.unmount()
})

test('/progress-bar clear stops a demo still playing', async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await command($, 'demo')
  await clock.advance(4_000)
  await command($, 'clear')
  // Past the fourth crab's spawn at 4.5s: had the demo kept playing, it would be here.
  await clock.advance(2_000)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined()
  await ui.unmount()

  await clock.advance(25_000)
  expect(await bandAlt($, false)).toBeUndefined()
})

test('a prompt a hook drops begins no run: the band keeps the run before', { options: { workTitles: false } }, async ($, on) => {
  const { clock, drops } = engine(on)
  await start($)
  await say($, 'Fix the band')
  await clock.settle()
  await mainTurn($, 't1')
  await endMain($, 't1')
  expect(await bandAlt($, false)).toBe('Fix the band: done')

  drops.add('Blocked by policy')
  await say($, 'Blocked by policy')
  await clock.settle()
  expect(await bandAlt($, false)).toBe('Fix the band: done')
  await clock.advance(40_000)
  expect(await bandAlt($, false)).toBe('Fix the band: done')
})

test('a second Enter before the first turn starts joins that run', { options: { workTitles: false } }, async ($, on) => {
  const { clock } = engine(on)
  await start($)
  await say($, 'Fix the login redirect')
  await clock.settle()
  await clock.advance(2_000)
  await say($, 'also update the readme')
  await clock.settle()
  await mainTurn($, 't1')
  expect(await bandAlt($, true)).toBe('Fix the login redirect: working')
})

test('a dropped prompt during the demo leaves the demo to finish, not stuck working', async ($, on) => {
  const { clock, drops } = engine(on)
  await start($)
  await command($, 'demo')
  await clock.advance(3_000)
  drops.add('Blocked by policy')
  await say($, 'Blocked by policy')
  await clock.settle()
  await clock.advance(30_000)
  expect(await bandAlt($, false)).toBe('Demo: six crabs at work: done')
})

test('/progress-bar clear puts back the run the demo took the band from', async ($, on) => {
  const { clock } = engine(on, 'Polish the progress bar')
  await start($)
  // An earlier run of two agents, then a run whose background agent outlives its turn.
  await say($, 'first run')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')
  await spawn($, 'b')
  await endAgent($, 'a')
  await endAgent($, 'b')
  await endMain($, 't1')
  await clock.advance(1_000)
  await say($, 'second run')
  await clock.settle()
  await mainTurn($, 't2')
  await spawn($, 'c')
  await endMain($, 't2')
  expect(await bandAlt($, false)).toBe('Polish the progress bar: 0 of 1 done, 0%')

  await command($, 'demo')
  await clock.advance(2_000)
  await command($, 'clear')
  expect(await bandAlt($, false)).toBe('Polish the progress bar: 0 of 1 done, 0%')
})

test('×N brings forward a pane open behind another tab, rather than closing it', async ($, on) => {
  const { clock, panes, behind, opens, closes } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')
  await clock.settle()
  behind.add('progress-bar')
  const [opened, closed] = [opens.length, closes.length]

  const ui = await $.ui.mount(band(true))
  await ui.press({ key: 'open-agents' })
  expect([...panes]).toEqual(['progress-bar'])
  expect(opens).toHaveLength(opened + 1)
  expect(closes).toHaveLength(closed + 1)
  // Now in front, the next press closes it.
  await ui.press({ key: 'open-agents' })
  expect([...panes]).toEqual([])
  await ui.unmount()
})

test('×N stays quiet when another plugin keeps the pane open', async ($, on) => {
  const { clock, panes, rules } = engine(on)
  await start($)
  await say($, 'polish the bar')
  await clock.settle()
  await mainTurn($, 't1')
  await spawn($, 'a')
  await clock.settle()
  rules.keepsPaneOpen = true

  // A refused close must not surface as a rejection nothing handled; the kit fails the file on one.
  const ui = await $.ui.mount(band(true))
  await ui.press({ key: 'open-agents' })
  await clock.settle()
  expect([...panes]).toEqual(['progress-bar'])
  await ui.unmount()
})

test('the pane draws words, not empty pictures, on the terminal', async ($, on) => {
  engine(on)
  await start($)
  await spawn($, 'a', 'Scout the repo')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Svg' })).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Scout the repo/ })).toBeDefined()
  await ui.unmount()
})
