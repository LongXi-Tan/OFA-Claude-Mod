import { expect, test } from 'claude-code/testing'

import { SCENE_POSES, SCENE_SEQUENCE, SCENE_TYPING } from './scene'
import { DESIGNS, FALLBACK, SCENE_S, agentSprite, bandBar, bandCrab, bandDot, bandLayout, bandTitle, designFor, mainSprite } from './sprites'
import type { CrabMood } from './sprites'

test('a spawn gets the crab its own words name', async () => {
  const cases: [Parameters<typeof designFor>[0], string][] = [
    // A studio's workers, by their descriptions and the first line of their briefs.
    [{ description: 'VFX Artist: explosion look', prompt: 'You are the VFX Artist worker of the game studio, lane `vfx`.' }, 'VFX Artist'],
    [{ description: '3D Model Artist: explosive barrel', prompt: 'You are the 3D Model Artist worker of the game studio.' }, '3D Modeler'],
    [{ description: 'Game Programmer: barrel component', prompt: 'You are the Game Programmer worker of the game studio.' }, 'Programmer'],
    // Plain requests that name no role.
    [{ description: 'Fix the login bug' }, 'Programmer'],
    [{ description: 'Add tests for the parser' }, 'Programmer'],
    [{ description: 'Sculpt a low-poly rock in Blender' }, '3D Modeler'],
    [{ description: 'Tune the fire particles' }, 'VFX Artist'],
    [{ description: 'Paint the crate textures' }, 'Painter'],
    [{ description: 'Mix the footstep sounds' }, 'Musician'],
    [{ description: 'Find where config is loaded' }, 'Explorer'],
    [{ description: 'Repo layout', subagentType: 'Explore' }, 'Explorer'],
    [{ description: 'Plan the next release', subagentType: 'Plan' }, FALLBACK],
    [{ description: '' }, FALLBACK],
  ]
  for (const [words, want] of cases) expect(designFor(words), JSON.stringify(words)).toBe(want)
})

test('a role word inside a longer word picks no crab', async () => {
  // "start" holds "art", "artistic" isn't "artist", "fixture" isn't "fix".
  expect(designFor({ description: 'Start the artistic fixture' })).toBe(FALLBACK)
})

test('the description outweighs the rest of the brief', async () => {
  expect(designFor({ description: 'Write the shader', prompt: 'Read the code and fix what breaks.' })).toBe('VFX Artist')
})

test('every crab is drawn, and the matcher hands out every one', async () => {
  for (const name of DESIGNS) expect(agentSprite(DESIGNS.indexOf(name), 'working'), name).toContain('<svg')
})

// The sprites are SVG strings, so these tests read the drawing itself: every rect, the
// groups around it and their classes, and the CSS and SVG timing that move them.

type Rect = { x: number; y: number; w: number; h: number; fill: string; groups: string[] }

const RESTING: CrabMood[] = ['done', 'failed', 'stopped']
const LAYOUT = bandLayout(640, 'Polish the progress bar')
const BAND = { width: LAYOUT.barW, done: 1, total: 3 }

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
  expectHopping(bandCrab(false), 'band')
})

test('a resting crab stands still on four planted legs', async () => {
  DESIGNS.forEach((name, design) => {
    for (const mood of RESTING) expectResting(agentSprite(design, mood), `${name} ${mood}`)
  })
  expectResting(bandCrab(true), 'band done')
})

test('the hop lifts one unit on a half-second beat, and nothing else moves the legs', async () => {
  for (const [who, svg] of Object.entries({ pane: agentSprite(0, 'working'), band: bandCrab(false) })) {
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
  const box = bandCrab(false)
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
    const svg = bandCrab(isDone)
    const who = isDone ? 'done' : 'working'
    // The click lands on a clear rect over the crab, drawn last so it is on top.
    expect(svg, `${who}: the click target`).toMatch(
      /<rect id="crab" x="\d+" y="0" width="24" height="\d+" fill="#000000" fill-opacity="0" pointer-events="all"[^>]*>(<title>[^<]*<\/title>)?<\/rect><\/svg>$/,
    )
    // Every timed part starts on that click and lasts the recording's length: the crab
    // stepping out, and each pose.
    const timings = [...svg.matchAll(/begin="([^"]+)" dur="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`)
    expect(timings, `${who}: timed parts`).toHaveLength(1 + SCENE_POSES.length)
    expect([...new Set(timings)], `${who}: their timing`).toEqual([`crab.click ${SCENE_S.toFixed(3)}s`])
    expect(svg).toMatch(/<g class="(walk|still)"><set attributeName="visibility" to="hidden" begin="crab\.click"/)
  }
  expect(SCENE_S.toFixed(3), 'the scene lasts as long as the recording').toBe((95 / 30).toFixed(3))
})

test('the scene plays clear of the percent, and the parts fit the band', async () => {
  for (const isDone of [false, true]) {
    const svg = bandCrab(isDone)
    const boxW = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1])
    const xs = posesIn(svg).flatMap(p => [...p.pixels.values()].flatMap(set => [...set].map(px => Number(px.split(',')[0]))))
    // The percent's room ends where the crab's box begins; the scene's nearest pixel stands well right of it.
    expect(Math.min(...xs), `${who(isDone)}: from the box's edge to the scene`).toBeGreaterThanOrEqual(8)
    expect(Math.max(...xs) < boxW, `${who(isDone)}: the scene inside the crab's box`).toBe(true)
  }
  for (const width of [260, 640, 1108]) {
    const l = bandLayout(width, 'Polish the progress bar for daily work, end to end')
    const used = l.dotW + l.titleBoxW + l.barW + l.percentW + l.crabW
    expect(used <= width, `${width}: the parts take ${used}`).toBe(true)
    expect(l.titleW <= l.titleBoxW - 14, `${width}: the title clear of the bar`).toBe(true)
    // Each part is drawn the band's height and the width the layout gave it.
    for (const [svg, w] of [
      [bandDot(false), l.dotW],
      [bandTitle(l), l.titleBoxW],
      [bandBar({ width: l.barW, done: 1, total: 3, isDone: false }), l.barW],
      [bandCrab(false), l.crabW],
    ] as const) {
      expect(svg).toMatch(new RegExp(`^<svg [^>]*viewBox="0 0 ${w} 26" width="${w}" height="26"`))
    }
  }
})

test('the bar\'s track is opaque, so a bar drawn over another covers it whole', async () => {
  const svg = bandBar({ ...BAND, isDone: false })
  const W = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1])
  expect(svg).toContain(`<rect class="track" x="0" y="0" width="${W}" height="20" rx="10"/>`)
  // Both schemes paint it in one solid colour, no see-through.
  expect(rulesFor(svg, 'track')).toEqual(['.track{fill:#343434}', '.track{fill:#EFEFEF}'])
  // Everything else of the bar lies on it: dots, ticks and pill within its 20 rows.
  const ys = [...svg.matchAll(/M\d+ (\d+)h2v2h-2z/g)].map(m => Number(m[1]))
  expect(Math.max(...ys) + 2 <= 20 && Math.min(...ys) >= 0).toBe(true)
})

test('every moment of the scene shows exactly one pose, in the recording\'s order', async () => {
  const poses = posesIn(bandCrab(false))
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
    const box = bandCrab(isDone)
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

/** The bar's dots, each `x,y fill opacity`, from the groups `isIn` takes by their classes, outermost first. */
function barDots(svg: string, isIn: (classes: string[]) => boolean) {
  const found = new Set<string>()
  const groups: string[] = []
  for (const [tag] of svg.matchAll(/<\/g>|<g\b[^>]*>|<path class="wd? [^"]*"[^>]*\/>/g)) {
    if (tag === '</g>') groups.pop()
    else if (tag.startsWith('<g')) groups.push(/\bclass="([^"]*)"/.exec(tag)?.[1] ?? '')
    else if (isIn(groups.flatMap(g => g.split(' ')))) {
      const [, fill, level, d = ''] = /fill="([^"]+)" fill-opacity="([^"]+)" d="([^"]+)"/.exec(tag) ?? []
      for (const [, x, y] of d.matchAll(/M(\d+) (\d+)h2v2h-2z/g)) found.add(`${x},${y} ${fill} ${level}`)
    }
  }
  return [...found].sort()
}

const pillX = (svg: string) => Number(/<rect class="breathe(?:-done)?" x="(\d+)"/.exec(svg)?.[1])

test('a step opens on the bar as it stood and plays out to the bar as it stands', async () => {
  const was = bandBar({ ...BAND, done: 1, total: 4, isDone: false })
  const is = bandBar({ ...BAND, done: 2, total: 4, isDone: false })
  const step = bandBar({ ...BAND, done: 2, total: 4, isDone: false, from: { done: 1, total: 4 } })
  // The dots: at the start, those kept and those going are the old bar's exactly; played
  // out, those kept, come and earned are the new bar's exactly.
  const coming = (cs: string[]) => cs.includes('appear') || cs.includes('grow')
  expect(barDots(step, cs => !coming(cs)), 'the opening dots').toEqual(barDots(was, () => true))
  expect(barDots(step, cs => !cs.includes('fade')), 'the closing dots').toEqual(barDots(is, () => true))
  expect(step).toMatch(/<g class="fade">/)
  // The pill: drawn at its new place, set back to its old one, and slid over.
  expect(pillX(is) > pillX(was)).toBe(true)
  expect(step).toContain(`<g class="slide" style="--from:${pillX(was) - pillX(is)}px"><rect class="breathe" x="${pillX(is)}"`)
  expect(rulesFor(step, 'slide')).toEqual(['.slide{animation:slide 0.7s cubic-bezier(0.22,0.8,0.3,1) both}'])
})

test('the trail a step earns comes in stretch by stretch, each as the pill passes it', async () => {
  const step = bandBar({ ...BAND, done: 3, total: 4, isDone: false, from: { done: 1, total: 4 } })
  const delays: number[] = []
  let lastX = -1
  for (let g = 0; g < 8; g++) {
    const xs = barDots(step, cs => cs.includes(`g${g}`)).map(dot => Number(dot.split(',')[0]))
    if (xs.length === 0) continue
    // Left to right, the stretches never overlap...
    expect(Math.min(...xs) > lastX, `stretch ${g} starts past the one before`).toBe(true)
    lastX = Math.max(...xs)
    // ...and each comes in later than the one before.
    const [rule = ''] = rulesFor(step, `g${g}`)
    delays.push(Number(/animation-delay:([\d.]+)s/.exec(rule)?.[1]))
  }
  expect(delays.length > 4, 'stretches earned').toBe(true)
  expect([...delays].sort((a, b) => a - b)).toEqual(delays)
  expect(delays[0]).toBe(0)
  expect(Math.max(...delays) < 0.7, 'all in while the pill slides').toBe(true)
  // The ticks the pill reaches go as it covers them, the first first; past it, none are left.
  const gone = [...step.matchAll(/<rect class="tick gone" style="animation-delay:([\d.]+)s" x="(\d+)"/g)]
  expect(gone).toHaveLength(2)
  expect(Number(gone[0]?.[1]) < Number(gone[1]?.[1]) && Number(gone[0]?.[2]) < Number(gone[1]?.[2])).toBe(true)
  expect(step.match(/<rect class="tick" x=/g) ?? []).toHaveLength(0)
})

test('only a step that moves the pill plays: none, the same counts, or a new agent that leaves it in place', async () => {
  for (const svg of [
    bandBar({ ...BAND, isDone: false }),
    bandBar({ ...BAND, isDone: false, from: { done: BAND.done, total: BAND.total } }),
    bandBar({ ...BAND, done: 0, total: 3, isDone: false, from: { done: 0, total: 2 } }),
  ]) {
    expect(svg).not.toMatch(/class="(slide|fade|appear|grow[^"]*|tick gone)"/)
  }
  // A new agent while some are done moves the pill back: it slides left, and earns nothing.
  const joined = bandBar({ ...BAND, done: 1, total: 3, isDone: false, from: { done: 1, total: 2 } })
  expect(joined).toMatch(/<g class="slide" style="--from:\d+px">/)
  expect(joined).not.toMatch(/class="grow/)
})

test('the shimmer is set to the clock, so a frame drawn for a step carries it on', async () => {
  const at = (ms: number) => bandBar({ ...BAND, isDone: false, at: ms })
  const sweep = (svg: string) => rulesFor(svg, 'k\\d+')
  // A wave's slices stand where the clock has them...
  expect(sweep(at(1_234))[0]).toBe('.k0{animation-delay:-1.234s}')
  expect(sweep(at(1_234))[1]).toBe(`.k1{animation-delay:${(1.3 / 20 - 1.234).toFixed(3)}s}`)
  // ...so a frame drawn a whole sweep later stands the same, and one drawn between does not.
  expect(sweep(at(1_234 + 2_400))).toEqual(sweep(at(1_234)))
  expect(sweep(at(1_234 + 1_000))).not.toEqual(sweep(at(1_234)))
  expect(rulesFor(at(1_234), 'breathe')).toContain('.breathe{animation-delay:-1.234s}')
})

test('the band stays inside the frame\'s size limit at its widest, mid-step', async () => {
  const l = bandLayout(1108, 'Polish the progress bar for daily work')
  for (const isDone of [false, true]) {
    const bar = bandBar({
      width: l.barW,
      done: 11,
      total: 24,
      isDone,
      ...(isDone ? {} : { from: { done: 1, total: 24 } }),
      at: 1_700_000_000_000,
    })
    for (const svg of [bar, bandCrab(isDone), bandTitle(l), bandDot(isDone)]) {
      expect(svg.length < 131_072, `${who(isDone)}: ${svg.length} characters`).toBe(true)
    }
  }
})

test('the main crab works through the recorded scene: the laptop comes out once, then the typing loops', async () => {
  const svg = mainSprite(true)
  const timings = [...svg.matchAll(/begin="([^"]+)" dur="([^"]+)"( repeatCount="indefinite")?/g)].map(m => m.slice(1).join(''))
  const [start, end] = SCENE_TYPING
  const introPoses = new Set(SCENE_SEQUENCE.slice(0, start).map(([p]) => p))
  const typingPoses = new Set(SCENE_SEQUENCE.slice(start, end).map(([p]) => p))
  const introS = (SCENE_SEQUENCE.slice(0, start).reduce((s, [, n]) => s + n, 0) / 30).toFixed(3)
  expect(timings.filter(t => t.startsWith('0s'))).toHaveLength(introPoses.size)
  expect(timings.filter(t => t.startsWith(`${introS}s`) && t.endsWith(' repeatCount="indefinite"'))).toHaveLength(typingPoses.size)
  expect(SCENE_SEQUENCE[start]![0], 'the loop opens and closes on one pose').toBe(SCENE_SEQUENCE[end - 1]![0])
  expect(mainSprite(false)).not.toContain('<animate')
})

test('as a turn ends, the main crab plays the scene\'s close once, then dozes', async () => {
  const svg = mainSprite(false, true)
  const close = SCENE_SEQUENCE.slice(SCENE_TYPING[1])
  const closeS = (close.reduce((s, [, n]) => s + n, 0) / 30).toFixed(3)
  // Each pose of the close, timed from the moment the frame loads, and none on a loop...
  const timings = [...svg.matchAll(/begin="([^"]+)" dur="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`)
  expect(timings).toHaveLength(new Set(close.map(([pose]) => pose)).size)
  expect([...new Set(timings)]).toEqual([`0s ${closeS}s`])
  expect(svg).not.toContain('repeatCount')
  // ...then the dozing crab, as drawn when idle, the moment the close ends.
  const dozing = mainSprite(false).split('</style>')[1]?.replace(/<\/svg>$/, '') ?? ''
  expect(dozing).toContain('class="zz"')
  expect(svg).toContain(`<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${closeS}s" fill="freeze"/>${dozing}</g>`)
})
