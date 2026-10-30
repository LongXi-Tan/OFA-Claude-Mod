// Pixel crabs and the band, drawn as SVG, one unit per pixel. Every animation is CSS
// inside the SVG, so a surface that draws it in an interactive frame runs it.
//
// The crab is Claude Desktop's, measured off a recording of it: a 16x12 body, 2x2 eyes in
// the upper third, 4x4 arms at the sides and four 2x4 legs beneath, the outer two flush
// with its sides.

import { SCENE_BODY, SCENE_FPS, SCENE_POSES, SCENE_SEQUENCE } from './scene'

const BODY = '#D97757'
const SHADE = '#B85F44'
const GREY = '#9A9A9A'
const EYE = '#1A1A1A'

const r = (x: number, y: number, w: number, h: number, fill: string, cls = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`

/** An SVG document `w` x `h` units; `top` above 0 leaves headroom for what hops. */
const svg = (w: number, h: number, css: string, body: string, top = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} ${w} ${h}" shape-rendering="crispEdges"><style>${css}</style>${body}</svg>`

// A working crab hops: it lifts a unit and lands, on a half-second beat, all of it at
// once (body, costume and all four legs), so no leg parts from the body or loses a pixel.
const BASE_CSS = `
.walk{animation:walk 2.4s steps(1) infinite}
@keyframes walk{0%{transform:translateX(0)}25%{transform:translateX(1px)}50%{transform:translateX(0)}75%{transform:translateX(-1px)}}
.hop{animation:hop .5s steps(1) infinite}
@keyframes hop{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
.blink{animation:blink 4s steps(1) infinite}
@keyframes blink{0%{opacity:1}95%{opacity:0}97%{opacity:1}}
.tw{animation:tw .8s steps(1) infinite}
.d2{animation-delay:-.3s}.d3{animation-delay:-.55s}
@keyframes tw{0%{opacity:1}50%{opacity:0}}
.flap{animation:flap .4s steps(1) infinite}
@keyframes flap{0%{transform:translateY(0)}50%{transform:translateY(1px)}}
.raise{animation:raise 1s steps(1) infinite}
@keyframes raise{0%{transform:translateY(0)}60%{transform:translateY(-2px)}}
.spin{transform-box:fill-box;transform-origin:center;animation:spin .6s steps(4) infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.note{animation:note 1.6s steps(4) infinite}
.note.d2{animation-delay:-.8s}
@keyframes note{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-6px);opacity:0}}
.dab{animation:dab .6s steps(1) infinite}
@keyframes dab{0%{transform:translate(0,0)}50%{transform:translate(-1px,1px)}}
.paint{animation:paint 2.4s steps(1) infinite}
@keyframes paint{0%{fill:#E5533D}33%{fill:#3A7BD5}66%{fill:#F5C542}}
.still,.still *{animation:none!important}
`

/** `stopped`: interrupted; `failed`: ended on an error. Both grey. */
export type CrabMood = 'working' | 'done' | 'failed' | 'stopped'

/** The designs a subagent can get, in the order they are handed out. */
export const DESIGNS = ['Wizard', 'Pirate', 'Ninja', 'Knight', 'Musician', 'Painter'] as const

type Eyes = 'open' | 'happy' | 'x' | 'flat' | 'left-only' | 'ninja'

const eyes = (ox: number, oy: number, kind: Eyes, ink = EYE) => {
  const xs = [ox + 2, ox + 12]
  const y = oy + 2
  switch (kind) {
    case 'happy':
      return xs.map(x => r(x - 1, y + 1, 1, 1, ink) + r(x, y, 2, 1, ink) + r(x + 2, y + 1, 1, 1, ink)).join('')
    case 'x':
      return xs
        .map(
          x =>
            r(x - 1, y - 1, 1, 1, ink) + r(x + 2, y - 1, 1, 1, ink) + r(x, y, 2, 2, ink) +
            r(x - 1, y + 2, 1, 1, ink) + r(x + 2, y + 2, 1, 1, ink),
        )
        .join('')
    case 'flat':
      return xs.map(x => r(x - 1, y + 1, 4, 1, ink)).join('')
    case 'left-only':
      return `<g class="blink">${r(xs[0]!, y, 2, 2, EYE)}</g>`
    case 'ninja':
      return `<g class="blink">${xs.map(x => r(x, y + 1, 2, 1, '#FFF')).join('')}</g>`
    default:
      return `<g class="blink">${xs.map(x => r(x, y, 2, 2, EYE)).join('')}</g>`
  }
}

/**
 * The four 2x4 legs under a body whose top-left is (ox, oy), where Claude Desktop's crab
 * stands them: the outer two flush with its sides, the inner two at +4 and +10.
 */
const legs = (ox: number, oy: number, body: string) =>
  [0, 4, 10, 14].map(dx => r(ox + dx, oy + 12, 2, 4, body)).join('')

/**
 * The crab, its body's top-left at (ox, oy); `gear` is drawn over the body, under the eyes.
 * Hopping, the whole of it sits in one `.hop` group, so it lifts and lands as one piece.
 */
const crab = (ox: number, oy: number, body: string, eyeKind: Eyes, isHopping: boolean, gear = '', ink = EYE) => {
  const whole =
    r(ox, oy, 16, 12, body) + r(ox - 4, oy + 4, 4, 4, body) + r(ox + 16, oy + 4, 4, 4, body) + gear +
    eyes(ox, oy, eyeKind, ink) + legs(ox, oy, body)
  return isHopping ? `<g class="hop">${whole}</g>` : whole
}

// Each costume sits on the crab at ox=10, oy=7 in a 36x24 box: body x 10..25, y 7..18;
// arms x 6..9 and 26..29, y 11..14; eyes at x 12 and 22, y 9..10; legs y 19..22.
const BROWN = '#7A4E2D'
const COSTUMES: Record<(typeof DESIGNS)[number], { eyes: Eyes; gear: string; side?: string }> = {
  Wizard: {
    eyes: 'open',
    gear:
      r(8, 5, 20, 2, '#6B4FBB') + r(11, 4, 14, 1, '#4A3590') + r(12, 2, 12, 2, '#6B4FBB') +
      r(14, 0, 8, 2, '#6B4FBB') + r(22, 1, 2, 1, '#6B4FBB') + r(16, 2, 2, 2, '#F5C542') +
      `<g class="raise">${r(30, 11, 2, 2, BROWN)}${r(32, 9, 2, 2, BROWN)}${r(33, 6, 3, 3, '#F5C542')}` +
      `${r(34, 3, 1, 1, '#FFF3B0', 'tw')}${r(31, 5, 1, 1, '#FFF3B0', 'tw d2')}${r(35, 10, 1, 1, '#FFF3B0', 'tw d3')}</g>`,
  },
  Pirate: {
    eyes: 'left-only',
    gear:
      r(10, 5, 16, 4, '#C8372D') + r(12, 6, 2, 2, '#FFF') + r(18, 7, 2, 1, '#FFF') + r(22, 5, 2, 2, '#FFF') +
      `<g class="flap">${r(6, 7, 4, 2, '#C8372D')}${r(4, 9, 4, 2, '#C8372D')}</g>` +
      r(21, 8, 4, 4, '#111') +
      r(30, 12, 2, 2, '#9AA3AD') + r(32, 10, 2, 2, '#9AA3AD') + r(32, 8, 2, 2, '#9AA3AD') + r(30, 7, 2, 2, '#9AA3AD'),
  },
  Ninja: {
    eyes: 'ninja',
    gear:
      r(10, 8, 16, 5, '#2B2B33') +
      `<g class="flap">${r(26, 8, 3, 2, '#2B2B33')}${r(29, 7, 4, 2, '#2B2B33')}${r(29, 10, 3, 2, '#2B2B33')}</g>`,
    side: `<g class="spin">${r(3, 2, 2, 6, '#8A8F99')}${r(1, 4, 6, 2, '#8A8F99')}${r(3, 4, 2, 2, '#333')}</g>`,
  },
  Knight: {
    eyes: 'open',
    gear:
      r(10, 3, 16, 5, '#A7AFBA') + r(10, 7, 16, 1, '#7D8590') +
      `<g class="flap">${r(16, 0, 4, 3, '#D33A3A')}${r(20, 0, 3, 2, '#D33A3A')}</g>` +
      `<g class="raise">${r(31, 2, 2, 9, '#D6DCE4')}${r(29, 11, 6, 1, '#8B6B2E')}${r(31, 12, 2, 3, '#5A3E1B')}</g>`,
  },
  Musician: {
    eyes: 'open',
    gear:
      r(12, 3, 12, 2, '#8A93A0') + r(10, 5, 2, 3, '#8A93A0') + r(24, 5, 2, 3, '#8A93A0') +
      r(8, 8, 3, 6, '#E0457B') + r(25, 8, 3, 6, '#E0457B'),
    side:
      `<g class="note">${r(30, 7, 3, 2, '#F5C542')}${r(32, 2, 1, 6, '#F5C542')}${r(33, 2, 2, 1, '#F5C542')}</g>` +
      `<g class="note d2">${r(1, 7, 3, 2, '#7FD1AE')}${r(3, 2, 1, 6, '#7FD1AE')}${r(4, 2, 2, 1, '#7FD1AE')}</g>`,
  },
  Painter: {
    eyes: 'open',
    gear:
      r(11, 4, 15, 4, '#8E2C48') + r(9, 6, 2, 2, '#8E2C48') + r(17, 2, 2, 2, '#8E2C48') +
      `<g class="dab">${r(30, 12, 2, 2, BROWN)}${r(32, 10, 2, 2, BROWN)}${r(34, 8, 2, 2, '#E5533D', 'paint')}</g>`,
    side: r(0, 16, 6, 4, '#C9A06B') + r(1, 17, 1, 1, '#E5533D') + r(3, 17, 1, 1, '#3A7BD5') + r(2, 18, 1, 1, '#F5C542'),
  },
}

const moodEyes = (mood: CrabMood, working: Eyes): Eyes =>
  mood === 'done' ? 'happy' : mood === 'failed' ? 'x' : mood === 'stopped' ? 'flat' : working

const moodBody = (mood: CrabMood) => (mood === 'failed' || mood === 'stopped' ? GREY : BODY)

/**
 * One subagent's crab, 36x25 units from y=-1: hopping while it works, resting once it ends.
 * The row above 0 is headroom, so a hat or sword at the top edge stays whole mid-hop.
 */
export const agentSprite = (design: number, mood: CrabMood): string => {
  const c = COSTUMES[DESIGNS[design % DESIGNS.length] ?? 'Wizard']
  // Eyes over a dark mask are drawn light, so the Ninja's moods still read.
  const ink = c.eyes === 'ninja' ? '#FFFFFF' : EYE
  const isHopping = mood === 'working'
  const inner = (c.side ?? '') + crab(10, 7, moodBody(mood), moodEyes(mood, c.eyes), isHopping, c.gear, ink)

  return svg(36, 25, BASE_CSS, `<g class="${isHopping ? 'walk' : 'still'}">${inner}</g>`, -1)
}

const MAIN_CSS = `
.rise{animation:rise .5s steps(3) both}
@keyframes rise{0%{transform:translateY(8px);opacity:0}100%{transform:translateY(0);opacity:1}}
.open{transform-box:fill-box;transform-origin:50% 100%;animation:open .45s steps(3) .5s both}
@keyframes open{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}
.line{transform-box:fill-box;transform-origin:0 50%;animation:type 2.4s steps(6) infinite both}
.l1{animation-delay:1s}.l2{animation-delay:1.5s}.l3{animation-delay:2s}
@keyframes type{0%{transform:scaleX(0)}45%,100%{transform:scaleX(1)}}
.cur{animation:tw .6s steps(1) infinite}
@keyframes tw{0%{opacity:1}50%{opacity:0}}
.tap{animation:tap .25s steps(1) infinite 1s}
.tap.d{animation-delay:1.12s}
@keyframes tap{0%{transform:translateY(0)}50%{transform:translateY(1px)}}
.blink{animation:blink 4s steps(1) infinite}
@keyframes blink{0%{opacity:1}95%{opacity:0}97%{opacity:1}}
.zz{animation:zz 2.4s steps(6) infinite}
.zz.d{animation-delay:-1.2s}
@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(4px,-6px);opacity:0}}
`

/**
 * The main session's crab, 52x24 units. Working: it pulls out a laptop, opens it
 * and types, code lines filling the screen. Idle: the laptop is shut and it dozes.
 */
export const mainSprite = (isWorking: boolean): string => {
  const ox = 6
  const oy = 6
  const feet = legs(ox, oy, BODY)

  if (!isWorking) {
    const z = (cls: string) =>
      `<text x="24" y="8" font-size="6" font-family="monospace" fill="#9AA3AD" class="${cls}">z</text>`
    return svg(
      52,
      24,
      MAIN_CSS,
      r(ox, oy, 16, 12, BODY) + r(ox - 4, oy + 4, 4, 4, BODY) + r(ox + 16, oy + 4, 4, 4, BODY) +
        r(ox + 2, oy + 3, 2, 1, EYE) + r(ox + 12, oy + 3, 2, 1, EYE) + feet +
        r(28, 19, 22, 3, '#9AA3AD') + r(28, 19, 22, 1, '#C3CAD2') + z('zz') + z('zz d'),
    )
  }

  // Facing the laptop: eyes shifted right, the right side in shade, the right arm on the keys.
  const torso =
    r(ox, oy, 16, 12, BODY) + r(ox + 14, oy, 2, 12, SHADE) +
    `<g class="blink">${r(ox + 3, oy + 2, 2, 2, EYE)}${r(ox + 13, oy + 2, 2, 2, EYE)}</g>`
  const arms =
    `<g class="tap">${r(ox - 4, oy + 4, 4, 4, BODY)}</g>` +
    `<g class="tap d">${r(ox + 16, oy + 6, 8, 3, BODY)}</g>`
  const laptop =
    `<g class="rise">` +
    r(27, 21, 24, 2, '#9AA3AD') + r(28, 20, 22, 1, '#C3CAD2') +
    `<g class="open">${r(30, 4, 18, 16, '#3C4048')}${r(32, 6, 14, 12, '#14202E')}` +
    r(34, 8, 7, 2, '#7FD1AE', 'line l1') + r(35, 11, 9, 2, '#79A8FF', 'line l2') +
    r(34, 14, 5, 2, '#F2B36B', 'line l3') + r(40, 14, 2, 2, '#FFFFFF', 'cur') +
    `</g></g>`

  return svg(52, 24, MAIN_CSS, laptop + torso + arms + feet)
}

/** A thin progress bar, `fraction` 0..1, `width` CSS pixels wide. */
export const barSprite = (width: number, fraction: number, color = '#D97757'): string => {
  const w = Math.max(10, Math.round(width))
  const f = Math.max(0, Math.min(1, fraction))
  const fill = Math.round((w - 2) * f)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 6" width="${w}" height="6">` +
    `<rect x="0" y="0" width="${w}" height="6" rx="3" fill="#8884"/>` +
    (fill > 0 ? `<rect x="1" y="1" width="${fill}" height="4" rx="2" fill="${color}"/>` : '') +
    `</svg>`
  )
}

// ---- The band -------------------------------------------------------------------

// A fixed scatter, so the dots stay put between redraws.
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Advance widths of ASCII 32..126 in 13px semibold system-ui (Segoe UI on Windows),
// measured in Chromium: space, punctuation, digits, A-Z, a-z and the rest in code order.
const ASCII_W = [
  3.62, 4.53, 6.77, 8.32, 8.02, 12.11, 11.85, 4.01, 5.07, 5.07, 6.34, 9.9, 3.71, 5.67, 3.71, 6.15,
  8.02, 8.02, 8.02, 8.02, 8.02, 8.02, 8.02, 8.02, 8.02, 8.02, 3.71, 3.71, 9.9, 9.9, 9.9, 6.16, 13.39,
  9.78, 8.89, 8.38, 10.29, 7.43, 7.26, 9.95, 10.68, 4.36, 5.79, 9.01, 7.11, 13.37, 11.03, 10.64, 8.55,
  10.64, 9.08, 7.82, 8.38, 10.09, 9.29, 13.99, 9.1, 8.43, 8.46, 5.07, 6.04, 5.07, 9.9, 5.83, 4.34,
  7.51, 8.66, 6.72, 8.64, 7.57, 5.27, 8.64, 8.39, 3.85, 4.11, 7.75, 3.85, 12.77, 8.42, 8.55, 8.66,
  8.64, 5.51, 6.42, 5.38, 8.42, 7.5, 11.07, 7.6, 7.47, 6.68, 5.07, 4.44, 5.07, 9.9,
]

const charWidth = (c: string) => {
  const code = c.codePointAt(0) ?? 0
  if (code >= 32 && code <= 126) return ASCII_W[code - 32] ?? 8
  if (c === '…') return 12.52
  // CJK, kana, hangul and full-width forms draw a full em.
  return /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 13 : 8.5
}

/** How wide a run of 13px semibold system-ui text draws, in CSS pixels. */
export const textWidth = (s: string) => [...s].reduce((w, c) => w + charWidth(c), 0)

/** `s`, cut with an ellipsis to fit `max` pixels. */
export const fitText = (s: string, max: number): string => {
  if (textWidth(s) <= max) return s
  let out = ''
  for (const c of s) {
    if (textWidth(`${out}${c}…`) > max) break
    out += c
  }
  return `${out.trimEnd()}…`
}


const H = 20 // the bar's height
const R = H / 2 // its ends are half circles
const PILL_W = 52 // one size in every state: the Done pill's
const CRAB_W = 28 // the crab's room at the band's right end
const SCENE_W = 16 // the room left of the crab its click scene reaches into, over the percent
const PERCENT_W = 36 // kept whether or not there is a percent, so the bar never jumps
const WAVES = 20 // the shimmer sweeps the trail over this many slices
const SPARKS = 6 // sets of dots that twinkle white, each on its own beat

/**
 * The band's height, its middle line at the centre. Measured off screenshots: with the
 * buttons in a group of their own, the app draws their words on the band frame's middle
 * line, so the drawing's middle sits there too and everything shares one line.
 */
export const BAND_H = 26
const MID = BAND_H / 2

// The trail from its start to the pill: deep, mid and light, each at two brightnesses.
const SHADES = { work: ['#6A5DD3', '#9C8FFF', '#D6CFFF'], done: ['#3F936A', '#5BBF8A', '#A9E7C4'] }
const LEVELS = [0.55, 1]

// The shimmer: working, a quick sweep and a rest; done, a slower, softer one.
const SWEEP = { work: { cycle: 2.4, cross: 1.3 }, done: { cycle: 3.6, cross: 2.2 } }

const delays = (cls: string, cross: number) =>
  Array.from({ length: WAVES }, (_, k) => `.${cls}${k}{animation-delay:${((k * cross) / WAVES).toFixed(3)}s}`).join('')

const BAND_CSS = `
.fg{fill:#ECECEC}.dim{fill:#9A9A9A}.track{fill:#FFFFFF;fill-opacity:.07}.tick{fill:#FFFFFF;fill-opacity:.3}
@media (prefers-color-scheme: light){.fg{fill:#1F1F1E}.dim{fill:#6B6B6B}.track{fill:#000000;fill-opacity:.06}.tick{fill:#000000;fill-opacity:.25}}
.pulse{animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.w{animation:wave ${SWEEP.work.cycle}s linear infinite;opacity:.4}
@keyframes wave{0%{opacity:.4}6%{opacity:1}18%{opacity:.7}36%,100%{opacity:.4}}
${delays('k', SWEEP.work.cross)}
.wd{animation:wave-done ${SWEEP.done.cycle}s ease-in-out infinite;opacity:.6}
@keyframes wave-done{0%{opacity:.6}10%{opacity:1}28%{opacity:.8}45%,100%{opacity:.6}}
${delays('j', SWEEP.done.cross)}
.sp{fill:#FFFFFF;opacity:0;animation:spark 2.8s ease-in-out infinite}
.spd{animation-duration:4.2s}
@keyframes spark{0%,70%,100%{opacity:0}80%{opacity:.95}90%{opacity:0}}
${Array.from({ length: SPARKS }, (_, s) => `.s${s}{animation-delay:-${((s * 2.8) / SPARKS).toFixed(2)}s}`).join('')}
.breathe{animation:breathe 2.4s ease-in-out infinite}
@keyframes breathe{0%,100%{fill:#8B7CF6}50%{fill:#A396FF}}
.breathe-done{animation:breathe-done 3.6s ease-in-out infinite}
@keyframes breathe-done{0%,100%{fill:#5BBF8A}50%{fill:#76D3A2}}
.pd{animation:pd 1.2s ease-in-out infinite;opacity:.35}
.pd1{animation-delay:.2s}.pd2{animation-delay:.4s}
@keyframes pd{0%,100%{opacity:.35}30%{opacity:1}}
`

/** Whether a dot centred at (cx, cy) lies inside the bar's rounded track of width `W`. */
const inTrack = (cx: number, cy: number, W: number) => {
  const x = Math.min(Math.max(cx, R), W - R)
  return (cx - x) ** 2 + (cy - R) ** 2 <= (R - 0.5) ** 2
}

/**
 * The bar, `W` x 20 at the origin. A trail of pixel dots runs from the start to the pill,
 * full height inside the rounded track: denser and lighter toward the pill, a shimmer
 * sweeping it from the start, a few dots twinkling white. The pill sits at its head, one
 * size in every state, glossy, its colour breathing; a tick marks each step to come. Done,
 * the whole bar turns green and keeps shimmering, slower and softer.
 */
const barMarkup = (W: number, done: number, total: number, isDone: boolean): string => {
  const fraction = isDone ? 1 : total > 0 ? done / total : 0
  const pillX = Math.round((W - PILL_W) * fraction)
  const trail = isDone ? W - R : pillX + R // the pill's left half hides the trail's end
  const shades = isDone ? SHADES.done : SHADES.work
  const [wave, delay, spark] = isDone ? ['wd', 'j', ' spd'] : ['w', 'k', '']

  // One path per slice, shade and brightness; every dot a 2x2 square on a 3px grid.
  const paths = new Map<string, string>()
  const sparks = new Map<number, string>()
  for (let x = 0; x + 2 <= trail; x += 3) {
    const t = trail > 0 ? x / trail : 0
    const density = isDone ? 0.35 + 0.55 * t : 0.1 + 0.85 * t ** 1.4
    const shade = t < 0.45 ? 0 : t < 0.8 ? 1 : 2
    const slice = Math.min(WAVES - 1, Math.floor(t * WAVES))
    for (let y = 0; y + 2 <= H; y += 3) {
      if (!inTrack(x + 1, y + 1, W) || hash(x, y) >= density) continue
      const level = hash(y + 11, x + 5) < 0.45 ? 0 : 1
      const key = `${slice}:${shade}:${level}`
      paths.set(key, `${paths.get(key) ?? ''}M${x} ${y}h2v2h-2z`)
      if (t > 0.1 && hash(x + 3, y + 7) < (isDone ? 0.05 : 0.08)) {
        const s = Math.floor(hash(x + 13, y + 17) * SPARKS)
        sparks.set(s, `${sparks.get(s) ?? ''}M${x} ${y}h2v2h-2z`)
      }
    }
  }
  let dots = ''
  for (const [key, d] of paths) {
    const [slice, shade, level] = key.split(':').map(Number) as [number, number, number]
    dots += `<path class="${wave} ${delay}${slice}" fill="${shades[shade]}" fill-opacity="${LEVELS[level]}" d="${d}"/>`
  }
  for (const [s, d] of sparks) dots += `<path class="sp s${s}${spark}" d="${d}"/>`

  let ticks = ''
  if (!isDone) {
    for (let k = 1; k < total; k++) {
      const c = Math.round((W - PILL_W) * (k / total) + PILL_W / 2)
      if (c > pillX + PILL_W + 3 && c < W - 3) ticks += `<rect class="tick" x="${c}" y="6" width="1" height="8"/>`
    }
  }

  const pill =
    `<rect class="${isDone ? 'breathe-done' : 'breathe'}" x="${pillX}" y="0" width="${PILL_W}" height="${H}" rx="${R}" fill="${isDone ? '#5BBF8A' : '#8B7CF6'}"/>` +
    // A soft gloss along its top.
    `<rect x="${pillX + 5}" y="2" width="${PILL_W - 10}" height="5" rx="2.5" fill="#FFFFFF" fill-opacity=".16"/>`

  const mid = pillX + PILL_W / 2
  const label = isDone ? 'Done' : total > 0 ? `${done}/${total}` : '' // nothing counted yet: three dots that breathe
  const text = label
    ? `<text x="${mid}" y="${R}" dominant-baseline="central" text-anchor="middle" font-size="11" font-weight="600" fill="#FFFFFF">${esc(label)}</text>`
    : [-6, 0, 6].map((dx, i) => `<circle class="pd pd${i}" cx="${mid + dx}" cy="${R}" r="1.8" fill="#FFFFFF"/>`).join('')

  return `<rect class="track" x="0" y="0" width="${W}" height="${H}" rx="${R}"/>${dots}${ticks}${pill}${text}`
}

// ---- The click scene ------------------------------------------------------------

const SCENE_COLOURS: Record<string, string> = { O: BODY, E: EYE, G: '#878787' }
const SCENE_FRAMES = SCENE_SEQUENCE.reduce((sum, [, frames]) => sum + frames, 0)
/** How long the scene plays, in seconds: the recording's own length. */
export const SCENE_S = SCENE_FRAMES / SCENE_FPS
// Every timed part of the scene starts on a click on the crab and lasts as long: SVG
// timing, no script, so it plays in the app's script-less frame.
const SCENE = `begin="crab.click" dur="${SCENE_S.toFixed(3)}s"`

/** One pose as paths, a colour each, its body's top-left at (ox, oy): one run of a row a segment. */
const posePaths = (rows: readonly string[], ox: number, oy: number) => {
  const d: Record<string, string> = {}
  const x0 = ox - SCENE_BODY.x
  const y0 = oy - SCENE_BODY.y
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x]!
      let w = 1
      while (row[x + w] === c) w++
      if (c !== '.') d[c] = `${d[c] ?? ''}M${x0 + x} ${y0 + y}h${w}v1h-${w}z`
      x += w
    }
  })
  return Object.entries(d)
    .map(([c, path]) => `<path fill="${SCENE_COLOURS[c]}" d="${path}"/>`)
    .join('')
}

/** When each pose shows: visible over each of its runs in the sequence, hidden between. */
const poseTimes = () => {
  const spans: [number, number][][] = SCENE_POSES.map(() => [])
  let at = 0
  for (const [pose, frames] of SCENE_SEQUENCE) {
    spans[pose]!.push([at, at + frames])
    at += frames
  }
  const t = (frame: number) => +(frame / SCENE_FRAMES).toFixed(4)
  return spans.map(runs => {
    const values: string[] = []
    const times: number[] = []
    if (runs[0]?.[0] !== 0) {
      values.push('hidden')
      times.push(0)
    }
    for (const [a, b] of runs) {
      values.push('visible')
      times.push(t(a))
      if (b < SCENE_FRAMES) {
        values.push('hidden')
        times.push(t(b))
      }
    }
    return { values: values.join(';'), keyTimes: times.join(';') }
  })
}

/**
 * The band's crab in a box 44 wide and the band's height, its body at x 22 on the middle
 * line: hopping, or resting once done. A click plays the recorded scene in its place, one
 * pose at a time on the recording's own timing: it pulls a laptop down from above, sets it
 * on the ground at its left, types, then folds it away and settles back where it stood.
 * A clear rect over the crab takes the click.
 */
const bandCrab = (isDone: boolean) => {
  const ox = SCENE_W + 6
  const oy = MID - 8
  const mood: CrabMood = isDone ? 'done' : 'working'
  const isHopping = !isDone
  const crabNow =
    `<g class="${isHopping ? 'walk' : 'still'}"><set attributeName="visibility" to="hidden" ${SCENE}/>` +
    `${crab(ox, oy, BODY, moodEyes(mood, 'open'), isHopping)}</g>`
  const times = poseTimes()
  const scene = SCENE_POSES.map((rows, k) => {
    const { values, keyTimes } = times[k]!
    return (
      `<g class="pose" visibility="hidden"><animate attributeName="visibility" calcMode="discrete" ` +
      `values="${values}" keyTimes="${keyTimes}" ${SCENE}/>${posePaths(rows, ox, oy)}</g>`
    )
  }).join('')
  const hit =
    `<rect id="crab" x="${ox - 4}" y="0" width="24" height="${BAND_H}" fill="#000000" fill-opacity="0" ` +
    `pointer-events="all" style="cursor:pointer"><title>Click: Claude pulls out a laptop and types</title></rect>`
  return crabNow + scene + hit
}

export type BandRow = {
  /** CSS pixels across. */
  width: number
  /** The run's work title; cut to fit. */
  title: string
  /** This run's subagents: how many have ended, and how many there are. */
  done: number
  total: number
  isDone: boolean
}

/**
 * The whole band but its buttons, `width` x BAND_H CSS pixels, as one drawing so the dot,
 * title, bar, percent and crab share one middle line: every text sits on it with
 * `dominant-baseline="central"`, and the bar and crab are centred on it.
 */
export const bandRow = (b: BandRow): string => {
  const W = Math.max(220, Math.round(b.width))
  const FONT = `font-family="system-ui,'Segoe UI',sans-serif"`
  const crabX = W - CRAB_W
  const barRight = crabX - 10 - PERCENT_W
  const titleMax = Math.max(40, Math.min(340, W * 0.38, barRight - 32 - 90))
  const title = fitText(b.title, titleMax)
  const titleW = Math.min(titleMax, Math.round(textWidth(title) * 100) / 100)
  const barX = Math.ceil(18 + titleW + 14)
  const barW = Math.max(PILL_W + 20, barRight - barX)
  const fraction = b.isDone ? 1 : b.total > 0 ? b.done / b.total : 0
  // The percent steps aside while the click scene uses the room beside it.
  const fade = `<animate attributeName="opacity" values="1;0;0;1" keyTimes="0;.06;.94;1" ${SCENE}/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${BAND_H}" width="${W}" height="${BAND_H}" ${FONT}>` +
    `<style>${BAND_CSS}${BASE_CSS}</style>` +
    `<circle${b.isDone ? '' : ' class="pulse"'} cx="6" cy="${MID}" r="4" fill="${b.isDone ? '#5BBF8A' : '#8B7CF6'}"/>` +
    // `textLength` holds the title to the width it was given, so a font wider than
    // Segoe UI (another machine's system-ui) still never runs into the bar.
    `<text class="fg" x="18" y="${MID}" dominant-baseline="central" font-size="13" font-weight="600" textLength="${titleW}" lengthAdjust="spacingAndGlyphs">${esc(title)}</text>` +
    `<g transform="translate(${barX} ${MID - R})">${barMarkup(barW, b.done, b.total, b.isDone)}</g>` +
    (b.total > 0
      ? `<text class="dim" x="${barRight + PERCENT_W}" y="${MID}" dominant-baseline="central" text-anchor="end" font-size="12">${Math.round(fraction * 100)}%${fade}</text>`
      : '') +
    `<svg x="${crabX - SCENE_W}" y="0" width="${SCENE_W + CRAB_W}" height="${BAND_H}" viewBox="0 0 ${SCENE_W + CRAB_W} ${BAND_H}" shape-rendering="crispEdges">` +
    `${bandCrab(b.isDone)}</svg>` +
    `</svg>`
  )
}
