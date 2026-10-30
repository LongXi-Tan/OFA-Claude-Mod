// Pixel crabs drawn as SVG, one unit per pixel. Every animation is CSS inside
// the SVG, so the pane draws each sprite in an interactive frame where it runs.
//
// The crab follows Claude Desktop's proportions: a 16x12 body, 2x2 eyes in the
// upper third, 4x4 arms at the sides and four 2x4 legs spaced evenly beneath.

const BODY = '#D97757'
const SHADE = '#B85F44'
const EYE = '#1A1A1A'

const r = (x: number, y: number, w: number, h: number, fill: string, cls = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`

const svg = (w: number, h: number, css: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><style>${css}</style>${body}</svg>`

const BASE_CSS = `
.walk{animation:walk 2.4s steps(1) infinite}
@keyframes walk{0%{transform:translateX(0)}25%{transform:translateX(1px)}50%{transform:translateX(0)}75%{transform:translateX(-1px)}}
.bob{animation:bob .5s steps(1) infinite}
.la{animation:bob .5s steps(1) infinite}
.lb{animation:bob .5s steps(1) infinite -.25s}
@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
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

export type CrabMood = 'working' | 'done' | 'failed'

/** The designs a subagent can get, in the order they are handed out. */
export const DESIGNS = ['Wizard', 'Pirate', 'Ninja', 'Knight', 'Musician', 'Painter'] as const

type Eyes = 'open' | 'happy' | 'x' | 'left-only' | 'ninja'

const eyes = (ox: number, oy: number, kind: Eyes, dx = 0) => {
  const xs = [ox + 2 + dx, ox + 12 + dx]
  const y = oy + 2
  switch (kind) {
    case 'happy':
      return xs.map(x => r(x - 1, y + 1, 1, 1, EYE) + r(x, y, 2, 1, EYE) + r(x + 2, y + 1, 1, 1, EYE)).join('')
    case 'x':
      return xs
        .map(
          x =>
            r(x - 1, y - 1, 1, 1, EYE) + r(x + 2, y - 1, 1, 1, EYE) + r(x, y, 2, 2, EYE) +
            r(x - 1, y + 2, 1, 1, EYE) + r(x + 2, y + 2, 1, 1, EYE),
        )
        .join('')
    case 'left-only':
      return `<g class="blink">${r(xs[0]!, y, 2, 2, EYE)}</g>`
    case 'ninja':
      return `<g class="blink">${xs.map(x => r(x, y + 1, 2, 1, '#FFF')).join('')}</g>`
    default:
      return `<g class="blink">${xs.map(x => r(x, y, 2, 2, EYE)).join('')}</g>`
  }
}

/** The crab, its body's top-left at (ox, oy); `gear` is drawn over the body, under the eyes. */
const crab = (ox: number, oy: number, body: string, eyeKind: Eyes, gear = '') => {
  const torso =
    r(ox, oy, 16, 12, body) + r(ox - 4, oy + 4, 4, 4, body) + r(ox + 16, oy + 4, 4, 4, body) + gear + eyes(ox, oy, eyeKind)
  const legsA = r(ox + 1, oy + 12, 2, 4, body) + r(ox + 9, oy + 12, 2, 4, body)
  const legsB = r(ox + 5, oy + 12, 2, 4, body) + r(ox + 13, oy + 12, 2, 4, body)

  return `<g class="bob">${torso}</g><g class="la">${legsA}</g><g class="lb">${legsB}</g>`
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
      `<g class="raise">${r(31, 0, 2, 11, '#D6DCE4')}${r(29, 11, 6, 1, '#8B6B2E')}${r(31, 12, 2, 3, '#5A3E1B')}</g>`,
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

const moodEyes = (mood: CrabMood, working: Eyes): Eyes => (mood === 'done' ? 'happy' : mood === 'failed' ? 'x' : working)

/** One subagent's crab, 36x24 units: walking while it works, resting once done. */
export const agentSprite = (design: number, mood: CrabMood): string => {
  const c = COSTUMES[DESIGNS[design % DESIGNS.length] ?? 'Wizard']
  const body = mood === 'failed' ? '#9A9A9A' : BODY
  const inner = (c.side ?? '') + crab(10, 7, body, moodEyes(mood, c.eyes), c.gear)

  return svg(36, 24, BASE_CSS, `<g class="${mood === 'working' ? 'walk' : 'still'}">${inner}</g>`)
}

/** The bare crab, 28x20 units, for the band. */
export const plainSprite = (mood: CrabMood): string =>
  svg(
    28,
    20,
    BASE_CSS,
    `<g class="${mood === 'working' ? 'walk' : 'still'}">${crab(6, 3, mood === 'failed' ? '#9A9A9A' : BODY, moodEyes(mood, 'open'))}</g>`,
  )

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
  const legs =
    r(ox + 1, oy + 12, 2, 4, BODY) + r(ox + 5, oy + 12, 2, 4, BODY) +
    r(ox + 9, oy + 12, 2, 4, BODY) + r(ox + 13, oy + 12, 2, 4, BODY)

  if (!isWorking) {
    const z = (cls: string) =>
      `<text x="24" y="8" font-size="6" font-family="monospace" fill="#9AA3AD" class="${cls}">z</text>`
    return svg(
      52,
      24,
      MAIN_CSS,
      r(ox, oy, 16, 12, BODY) + r(ox - 4, oy + 4, 4, 4, BODY) + r(ox + 16, oy + 4, 4, 4, BODY) +
        r(ox + 2, oy + 3, 2, 1, EYE) + r(ox + 12, oy + 3, 2, 1, EYE) + legs +
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

  return svg(52, 24, MAIN_CSS, laptop + torso + arms + legs)
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

// A fixed scatter, so the dots stay put between redraws.
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const BAND_CSS = `
.t0,.t1,.t2,.t3{animation:glow 1.6s ease-in-out infinite}
.t1{animation-delay:-.4s}.t2{animation-delay:-.8s}.t3{animation-delay:-1.2s}
@keyframes glow{0%,100%{opacity:.25}50%{opacity:1}}
.shine{animation:shine 1.8s linear infinite}
@keyframes shine{0%{transform:translateX(0)}100%{transform:translateX(var(--run))}}
`

/**
 * The band's bar, `width` x 20 CSS pixels: a trail of glowing pixel dots up to the
 * fill, a pill at its head that carries `label` with a shine sweeping over it, and a
 * tick at each step still to come. Done, it turns green from end to end.
 */
export const bandBar = (width: number, fraction: number, label: string, isDone: boolean, steps: number): string => {
  const W = Math.max(80, Math.round(width))
  const H = 20
  const pill = isDone ? '#5BBF8A' : '#8B7CF6'
  const dot = isDone ? '#7FD1AE' : '#B9AEFF'
  const pillW = Math.min(W, Math.round(label.length * 6.6 + 24))
  const fillW = isDone ? W : Math.max(pillW, Math.round(W * Math.max(0, Math.min(1, fraction))))
  const pillX = fillW - pillW

  let dots = ''
  for (let x = 2; x < pillX + 4; x += 3) {
    for (let y = 3; y < H - 3; y += 3) {
      const density = isDone ? 0.5 : 0.12 + 0.6 * (x / Math.max(1, pillX))
      if (hash(x, y) >= density) continue
      const opacity = (0.35 + 0.65 * hash(y, x)).toFixed(2)
      dots += `<rect x="${x}" y="${y}" width="2" height="2" fill="${dot}" opacity="${opacity}"${
        isDone ? '' : ` class="t${Math.floor(hash(x + 7, y + 3) * 4)}"`
      }/>`
    }
  }

  let ticks = ''
  if (!isDone && steps > 1) {
    for (let k = 1; k < steps; k++) {
      const tx = Math.round((W * k) / steps)
      if (tx > fillW + 4 && tx < W - 4) ticks += `<rect x="${tx}" y="6" width="1" height="8" fill="#FFFFFF" opacity=".28"/>`
    }
  }

  const shine = isDone
    ? ''
    : `<clipPath id="p"><rect x="${pillX}" y="0" width="${pillW}" height="${H}" rx="10"/></clipPath>` +
      `<g clip-path="url(#p)"><g class="shine" style="--run:${pillW + 30}px"><rect x="${pillX - 24}" y="0" width="12" height="${H}" fill="#FFFFFF" opacity=".35" transform="skewX(-20)"/></g></g>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>${BAND_CSS}</style>` +
    `<rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="#FFFFFF" opacity=".06"/>` +
    dots +
    ticks +
    `<rect x="${pillX}" y="0" width="${pillW}" height="${H}" rx="10" fill="${pill}"/>` +
    shine +
    `<text x="${pillX + pillW / 2}" y="14" text-anchor="middle" font-size="11" font-weight="600" ` +
    `font-family="system-ui,'Segoe UI',sans-serif" fill="#FFFFFF">${esc(label)}</text>` +
    `</svg>`
  )
}
