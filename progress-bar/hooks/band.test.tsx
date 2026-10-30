import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'progress-bar',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the demo moves the band one step per finished task, then turns it Done', async ($, on) => {
  // Beneath the plugin stands the engine: a clock the test moves, a pane that opens.
  const clock = mock.clock(on, { now: 1_000 })
  on('command.register', () => ({ value: { command: 'progress-bar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ran = await $.command.run({
    command: 'progress-bar',
    args: '[demo]',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(ran.text).toMatch(/Playing the progress-bar demo/)

  const ui = await $.ui.mount(BAND)
  const seen: string[] = []
  for (let s = 0; s <= 24; s++) {
    const band = await ui.find({ type: 'Svg' })
    const label = String(band?.props.alt ?? '')
    if (seen.at(-1) !== label) seen.push(label)
    await clock.advance(1_000)
  }
  await ui.unmount()

  // Every agent that joins or finishes moves the band; the run ends Done.
  const run = (s: string) => `Demo: six crabs at work: ${s}`
  expect(seen[0]).toBe(run('working'))
  expect(seen).toContain(run('0 of 6 done, 0%'))
  for (const [n, pct] of [[1, 17], [2, 33], [3, 50], [4, 67], [5, 83], [6, 100]]) {
    expect(seen).toContain(run(`${n} of 6 done, ${pct}%`))
  }
  expect(seen.at(-1)).toBe(run('done'))
})

test('the band draws the pill one size in every state, and dots across the full height', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  on('command.register', () => ({ value: { command: 'progress-bar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({
    command: 'progress-bar',
    args: 'demo',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  const drawn = async () => {
    const ui = await $.ui.mount(BAND)
    const source = String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
    await ui.unmount()
    return source
  }

  // Midway, a few agents done: a trail to show, and a working pill.
  await clock.advance(14_000)
  const working = await drawn()
  await clock.advance(10_000)
  const done = await drawn()

  // The pill: 52 wide and 20 tall in both states, the Done pill's size; no slanted glint.
  const pill = (fill: string) => new RegExp(`<rect( class="breathe")? x="\\d+" y="0" width="52" height="20" rx="10" fill="${fill}"/>`)
  expect(working).toMatch(pill('#8B7CF6'))
  expect(done).toMatch(pill('#5BBF8A'))
  expect(working).not.toMatch(/glint|polygon/)
  // Dots from the bar's top row to its bottom one.
  for (const source of [working, done]) {
    expect(source).toMatch(/M\d+ 0h2v2h-2z/)
    expect(source).toMatch(/M\d+ 18h2v2h-2z/)
  }
})
