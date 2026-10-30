import { expect, test } from 'claude-code/testing'

import { SCENE_POSES, SCENE_SEQUENCE } from './scene'
import { DESIGNS, SCENE_S, agentSprite, bandRow } from './sprites'
import type { CrabMood } from './sprites'

// The sprites are SVG strings, so these tests read the drawing itself: every rect, the
// groups around it and their classes, and the CSS and SVG timing that move them.

type Rect = { x: number; y: number; w: number; h: number; fill: string; groups: string[] }

const RESTING: CrabMood[] = ['done', 'failed', 'stopped']
const BAND = { width: 640, title: 'Polish the progress bar', done: 1, total: 3 }

/** Every rect, with the classes of each group around it, outermost first, joined. */
function rects(svg: string): Rect[] {
  const found: Rect[] = []
  const groups: string[] = []
  for (const [tag] of svg.matchAll(/<\/g>|<g\b[^>]*>|<rect\b[^>]*>/g)) {
    if (tag === '</g>') groups.pop()
    else if (tag.startsWith('<g')) groups.push(/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '')
    else {
      const [, x, y, w, h] = /\sx="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(tag) ?? []
      const fill = /\sfill="([^"]+)"/.exec(tag)?.[1] ?? ''
      found.push({ x: Number(x), y: Number(y), w: Number(w), h: Number(h), fill, groups: [...groups] })
    }
  }
  return found
}

const inGroup = (r: Rect, cls: string) => r.groups.some(g => g.split(' ').includes(cls))

/** The band's crab box: the drawing nested at its right end. */
const crabBox = (band: string) => /<svg x="[\s\S]*?<\/svg>/.exec(band)?.[0] ?? ''

/** The crab itself, not the laptop scene's typist that stands in for it on a click. */
const ownCrab = (svg: string) => rects(svg).filter(r => !inGroup(r, 'scene'))

/** The crab's 16x12 body: every leg starts on the row below it. */
function bodyOf(all: Rect[], who: string) {
  const bodies = all.filter(r => r.w === 16 && r.h === 12)
  expect(bodies, `${who}: bodies`).toHaveLength(1)
  return bodies[0]!
}

/** Rects that share an edge make one piece: a whole leg is one, and a part that parts from it another. */
function pieces(rs: Rect[]): Rect[][] {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1
  const reach = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1
  const touch = (a: Rect, b: Rect) =>
    (overlap(a.x, a.x + a.w, b.x, b.x + b.w) && reach(a.y, a.y + a.h, b.y, b.y + b.h)) ||
    (overlap(a.y, a.y + a.h, b.y, b.y + b.h) && reach(a.x, a.x + a.w, b.x, b.x + b.w))
  let found: Rect[][] = []
  for (const r of rs) {
    const joined = found.filter(p => p.some(q => touch(q, r)))
    found = [...found.filter(p => !joined.includes(p)), [r, ...joined.flat()]]
  }
  return found
}

/** How many pixels the rects cover, each counted once. */
function area(rs: Rect[]) {
  const px = new Set<string>()
  for (const r of rs) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) px.add(`${x},${y}`)
  return px.size
}

/** Four whole 2x4 legs hanging from the body's bottom row, under it. */
function expectLegs(all: Rect[], body: Rect, who: string) {
  const under = (r: Rect) => r.x >= body.x && r.x + r.w <= body.x + body.w
  const legs = pieces(all.filter(r => r.y >= body.y + body.h && under(r)))
  expect(legs, `${who}: legs`).toHaveLength(4)
  for (const leg of legs) {
    expect(area(leg), `${who}: pixels in a leg`).toBe(8)
    const top = leg.reduce((a, b) => (b.y < a.y ? b : a))
    expect(top.y, `${who}: the row a leg starts on`).toBe(body.y + body.h)
  }
  return legs.flat()
}

/** A hopping crab: body, arms, eyes, costume and legs all ride the one `.hop` group. */
function expectHopping(svg: string, who: string) {
  const all = ownCrab(svg)
  const body = bodyOf(all, who)
  expect(body.groups, `${who}: what holds the body`).toEqual(['walk', 'hop'])
  for (const leg of expectLegs(all, body, who)) expect(leg.groups, `${who}: what holds a leg`).toEqual(['walk', 'hop'])
  const arms = all.filter(r => r.w === 4 && r.h === 4 && r.y === body.y + 4)
  expect(arms, `${who}: arms`).toHaveLength(2)
  for (const arm of arms) expect(inGroup(arm, 'hop'), `${who}: an arm rides the hop`).toBe(true)
}

/** A resting crab: held still, nothing hopping, four planted legs under the body. */
function expectResting(svg: string, who: string) {
  const all = ownCrab(svg)
  const body = bodyOf(all, who)
  expect(body.groups, `${who}: what holds the body`).toEqual(['still'])
  expect(svg, `${who}: a hop group`).not.toMatch(/class="hop"/)
  expectLegs(all, body, who)
}

/** Every CSS rule whose selector names `cls`, as written. */
function rulesFor(svg: string, cls: string) {
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(m => new RegExp(`\\.${cls}\\b`).test(m[1] ?? ''))
    .map(m => `${(m[1] ?? '').trim()}{${m[2] ?? ''}}`)
}

test('every design hops as one piece: body, arms, costume and four whole legs together', async () => {
  DESIGNS.forEach((name, design) => expectHopping(agentSprite(design, 'working'), name))
})

test('the band crab hops the same way', async () => {
  expectHopping(crabBox(bandRow({ ...BAND, isDone: false })), 'band')
})

test('a resting crab stands still on four planted legs', async () => {
  DESIGNS.forEach((name, design) => {
    for (const mood of RESTING) expectResting(agentSprite(design, mood), `${name} ${mood}`)
  })
  expectResting(crabBox(bandRow({ ...BAND, isDone: true })), 'band done')
})

test('the hop lifts one unit on a half-second beat, and nothing else moves the legs', async () => {
  for (const [who, svg] of Object.entries({ pane: agentSprite(0, 'working'), band: bandRow({ ...BAND, isDone: false }) })) {
    expect(rulesFor(svg, 'hop'), `${who}: rules for .hop`).toEqual(['.hop{animation:hop .5s steps(1) infinite}'])
    expect(svg, `${who}: the hop`).toContain('@keyframes hop{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}')
    // The old ways of moving legs on their own are gone, markup and CSS alike.
    for (const old of ['la', 'lb', 'bob', 'pose-a', 'pose-b']) {
      expect(svg, `${who}: class ${old}`).not.toMatch(new RegExp(`class="[^"]*\\b${old}\\b`))
      expect(rulesFor(svg, old), `${who}: rules for .${old}`).toEqual([])
    }
  }
})

test('a hop never lifts a hat or a sword out of the drawing', async () => {
  DESIGNS.forEach((name, design) => {
    const svg = agentSprite(design, 'working')
    const top = Number(/viewBox="0 (-?[\d.]+) /.exec(svg)?.[1])
    // At the peak: the hop's unit, and two more for a prop that raises itself.
    const peaks = rects(svg)
      .filter(r => inGroup(r, 'hop'))
      .map(r => r.y - 1 - (inGroup(r, 'raise') ? 2 : 0))
    expect(Math.min(...peaks) >= top, `${name}: highest point mid-hop ${Math.min(...peaks)}, top ${top}`).toBe(true)
  })
  const box = crabBox(bandRow({ ...BAND, isDone: false }))
  const peak = Math.min(...rects(box).filter(r => inGroup(r, 'hop')).map(r => r.y - 1))
  expect(peak >= 0, `band: highest point mid-hop ${peak}`).toBe(true)
})


/** The scene's poses as the band draws them: each one's timing and its pixels, by colour. */
function posesIn(box: string) {
  return [
    ...box.matchAll(
      /<g class="pose" visibility="hidden"><animate attributeName="visibility" calcMode="discrete" values="([^"]+)" keyTimes="([^"]+)" begin="crab\.click" dur="([^"]+)"\/>(.*?)<\/g>/g,
    ),
  ].map(([, values = '', keyTimes = '', dur = '', paths = '']) => {
    const pixels = new Map<string, Set<string>>()
    for (const [, fill = '', d = ''] of paths.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)) {
      const set = pixels.get(fill) ?? new Set<string>()
      for (const [, x, y, w] of d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v1h-\d+z/g)) {
        for (let i = 0; i < Number(w); i++) set.add(`${Number(x) + i},${y}`)
      }
      pixels.set(fill, set)
    }
    return { values: values.split(';'), keyTimes: keyTimes.split(';').map(Number), dur, pixels }
  })
}

/** The rects' pixels by colour. */
function pixelsOf(rs: Rect[]) {
  const pixels = new Map<string, Set<string>>()
  for (const r of rs) {
    const set = pixels.get(r.fill) ?? new Set<string>()
    for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) set.add(`${x},${y}`)
    pixels.set(r.fill, set)
  }
  return pixels
}

test('a click on the band crab plays the recorded scene in its place, then gives it back', async () => {
  for (const isDone of [false, true]) {
    const svg = bandRow({ ...BAND, isDone })
    const who = isDone ? 'done' : 'working'
    // The click lands on a clear rect over the crab, drawn last so it is on top.
    expect(svg, `${who}: the click target`).toMatch(
      /<rect id="crab" x="\d+" y="0" width="24" height="\d+" fill="#000000" fill-opacity="0" pointer-events="all"[^>]*>(<title>[^<]*<\/title>)?<\/rect><\/svg><\/svg>$/,
    )
    // Every timed part starts on that click and lasts the recording's length: the crab
    // stepping out, the percent stepping aside, and each pose.
    const timings = [...svg.matchAll(/begin="([^"]+)" dur="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`)
    expect(timings, `${who}: timed parts`).toHaveLength(2 + SCENE_POSES.length)
    expect([...new Set(timings)], `${who}: their timing`).toEqual([`crab.click ${SCENE_S.toFixed(3)}s`])
    expect(svg).toMatch(/<g class="(walk|still)"><set attributeName="visibility" to="hidden" begin="crab\.click"/)
    expect(svg).toMatch(/%<animate attributeName="opacity" values="1;0;0;1" keyTimes="0;\.06;\.94;1" begin="crab\.click"/)
  }
  expect(SCENE_S.toFixed(3), 'the scene lasts as long as the recording').toBe((95 / 30).toFixed(3))
})

test('every moment of the scene shows exactly one pose, in the recording\'s order', async () => {
  const poses = posesIn(crabBox(bandRow({ ...BAND, isDone: false })))
  expect(poses).toHaveLength(SCENE_POSES.length)
  const total = SCENE_SEQUENCE.reduce((sum, [, n]) => sum + n, 0)
  // Discrete timing: a pose shows the value of the last key time at or before the moment.
  const shown = (p: (typeof poses)[number], t: number) =>
    p.values[p.keyTimes.reduce((last, kt, i) => (kt <= t ? i : last), 0)] === 'visible'
  let frame = 0
  for (const [pose, frames] of SCENE_SEQUENCE) {
    for (let f = frame; f < frame + frames; f++) {
      const t = (f + 0.5) / total
      const visible = poses.flatMap((p, k) => (shown(p, t) ? [k] : []))
      expect(visible, `frame ${f}: the poses showing`).toEqual([pose])
    }
    frame += frames
  }
})

test('the scene starts and ends on the crab\'s own pixels, so the hand-off is seamless', async () => {
  for (const isDone of [false, true]) {
    const box = crabBox(bandRow({ ...BAND, isDone }))
    const now = pixelsOf(rects(box).filter(r => !inGroup(r, 'pose') && r.w !== 24))
    const poses = posesIn(box)
    const first = poses[SCENE_SEQUENCE[0]![0]]!
    const last = poses[SCENE_SEQUENCE.at(-1)![0]]!
    // The crab's outline: body and eyes together, whatever its eyes are doing.
    const outline = (pixels: Map<string, Set<string>>) => [
      ...new Set([...(pixels.get('#D97757') ?? []), ...(pixels.get('#1A1A1A') ?? [])]),
    ]
    const crabOutline = outline(now)
    // It opens on the crab exactly; working, its eyes too (resting, the crab's are its happy ones).
    expect(outline(first.pixels).sort(), `${who(isDone)}: first pose's outline`).toEqual([...crabOutline].sort())
    if (!isDone) {
      expect([...(first.pixels.get('#1A1A1A') ?? [])].sort(), 'first pose: eyes').toEqual(
        [...(now.get('#1A1A1A') ?? [])].sort(),
      )
    }
    // It closes as the recording does, on the frame before the crab stands as it was: its
    // arms a row lower, all else the crab's own.
    const xs = crabOutline.map(p => Number(p.split(',')[0]))
    const isArm = (p: string) => Number(p.split(',')[0]) < Math.min(...xs) + 4 || Number(p.split(',')[0]) > Math.max(...xs) - 4
    const lowered = crabOutline.map(p => (isArm(p) ? `${p.split(',')[0]},${Number(p.split(',')[1]) + 1}` : p))
    expect(outline(last.pixels).sort(), `${who(isDone)}: last pose's outline`).toEqual(lowered.sort())
  }
})

const who = (isDone: boolean) => (isDone ? 'done' : 'working')
