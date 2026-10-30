// Pixel crabs drawn as SVG, one unit per pixel. Every animation is CSS inside
// the SVG, so the pane draws each sprite in an interactive frame where it runs.

const BODY = '#D97757'
const EYE = '#1A1A1A'

const r = (x: number, y: number, w: number, h: number, fill: string, cls = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${cls ? ` class="${cls}"` : ''}/>`

const svg = (w: number, h: number, css: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><style>${css}</style>${body}</svg>`

const BASE_CSS = `
.walk{animation:walk 2s steps(1) infinite}
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
@keyframes note{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-5px);opacity:0}}
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

const eyes = (ox: number, oy: number, kind: Eyes) => {
  const lx = ox + 5
  const rx = ox + 10
  const y = oy + 2
  switch (kind) {
    case 'happy':
      return r(lx - 1, y, 1, 1, EYE) + r(lx, y - 1, 1, 1, EYE) + r(lx + 1, y, 1, 1, EYE) +
        r(rx - 1, y, 1, 1, EYE) + r(rx, y - 1, 1, 1, EYE) + r(rx + 1, y, 1, 1, EYE)
    case 'x':
      return r(lx - 1, y - 1, 1, 1, EYE) + r(lx + 1, y - 1, 1, 1, EYE) + r(lx, y, 1, 1, EYE) +
        r(lx - 1, y + 1, 1, 1, EYE) + r(lx + 1, y + 1, 1, 1, EYE) +
        r(rx - 1, y - 1, 1, 1, EYE) + r(rx + 1, y - 1, 1, 1, EYE) + r(rx, y, 1, 1, EYE) +
        r(rx - 1, y + 1, 1, 1, EYE) + r(rx + 1, y + 1, 1, 1, EYE)
    case 'left-only':
      return `<g class="blink">${r(lx, y, 1, 2, EYE)}</g>`
    case 'ninja':
      return `<g class="blink">${r(lx, y, 1, 1, '#FFF')}${r(rx, y, 1, 1, '#FFF')}</g>`
    default:
      return `<g class="blink">${r(lx, y, 1, 2, EYE)}${r(rx, y, 1, 2, EYE)}</g>`
  }
}

/** The crab itself: a 16x8 body with arms, eyes and four legs, top-left at (ox, oy). */
const crab = (ox: number, oy: number, body: string, eyeKind: Eyes, extra: string, rightArm = true) => {
  const torso =
    r(ox + 2, oy, 12, 6, body) +
    r(ox, oy + 2, 2, 2, body) +
    (rightArm ? r(ox + 14, oy + 2, 2, 2, body) : '') +
    extra +
    eyes(ox, oy, eyeKind)
  const legsA = r(ox + 3, oy + 6, 1, 2, body) + r(ox + 10, oy + 6, 1, 2, body)
  const legsB = r(ox + 5, oy + 6, 1, 2, body) + r(ox + 12, oy + 6, 1, 2, body)

  return `<g class="bob">${torso}</g><g class="la">${legsA}</g><g class="lb">${legsB}</g>`
}

// Each costume: what sits on or around the crab at ox=4, oy=7, in a 24x16 box.
// Body spans x 6..17, y 7..12; arms at x 4..5 and 18..19, y 9..10; eyes at x 9 and 14.
const COSTUMES: Record<(typeof DESIGNS)[number], { eyes: Eyes; gear: string; side?: string }> = {
  Wizard: {
    eyes: 'open',
    gear:
      r(7, 6, 10, 1, '#6B4FBB') + r(8, 5, 8, 1, '#4A3590') + r(9, 4, 6, 1, '#6B4FBB') +
      r(10, 3, 4, 1, '#6B4FBB') + r(11, 2, 3, 1, '#6B4FBB') + r(13, 1, 2, 1, '#6B4FBB') +
      r(11, 3, 1, 1, '#F5C542') +
      `<g class="raise">${r(20, 8, 1, 1, '#7A4E2D')}${r(21, 7, 1, 1, '#7A4E2D')}${r(22, 6, 1, 1, '#F5C542')}` +
      `${r(23, 5, 1, 1, '#FFF3B0', 'tw')}${r(21, 5, 1, 1, '#FFF3B0', 'tw d2')}${r(23, 7, 1, 1, '#FFF3B0', 'tw d3')}</g>`,
  },
  Pirate: {
    eyes: 'left-only',
    gear:
      r(6, 6, 12, 2, '#C8372D') + r(8, 6, 1, 1, '#FFF') + r(12, 7, 1, 1, '#FFF') + r(15, 6, 1, 1, '#FFF') +
      `<g class="flap">${r(4, 7, 2, 1, '#C8372D')}${r(3, 8, 2, 1, '#C8372D')}</g>` +
      r(13, 9, 3, 2, '#111') + r(16, 8, 2, 1, '#111') +
      r(20, 9, 1, 1, '#9AA3AD') + r(21, 8, 1, 1, '#9AA3AD') + r(21, 7, 1, 1, '#9AA3AD') + r(20, 6, 1, 1, '#9AA3AD'),
  },
  Ninja: {
    eyes: 'ninja',
    gear:
      r(6, 8, 12, 3, '#2B2B33') +
      `<g class="flap">${r(18, 8, 2, 1, '#2B2B33')}${r(20, 7, 2, 1, '#2B2B33')}${r(20, 9, 2, 1, '#2B2B33')}</g>`,
    side: `<g class="spin">${r(2, 3, 1, 3, '#8A8F99')}${r(1, 4, 3, 1, '#8A8F99')}${r(2, 4, 1, 1, '#333')}</g>`,
  },
  Knight: {
    eyes: 'open',
    gear:
      r(6, 5, 12, 3, '#A7AFBA') + r(6, 7, 12, 1, '#7D8590') +
      `<g class="flap">${r(11, 3, 2, 2, '#D33A3A')}${r(13, 2, 2, 1, '#D33A3A')}</g>` +
      `<g class="raise">${r(21, 2, 1, 6, '#D6DCE4')}${r(20, 8, 3, 1, '#8B6B2E')}${r(21, 9, 1, 1, '#5A3E1B')}</g>`,
  },
  Musician: {
    eyes: 'open',
    gear:
      r(7, 4, 10, 1, '#8A93A0') + r(6, 5, 1, 2, '#8A93A0') + r(17, 5, 1, 2, '#8A93A0') +
      r(4, 7, 2, 3, '#E0457B') + r(18, 7, 2, 3, '#E0457B'),
    side:
      `<g class="note">${r(20, 6, 2, 1, '#F5C542')}${r(21, 3, 1, 3, '#F5C542')}${r(22, 3, 1, 1, '#F5C542')}</g>` +
      `<g class="note d2">${r(1, 6, 2, 1, '#7FD1AE')}${r(2, 3, 1, 3, '#7FD1AE')}${r(3, 3, 1, 1, '#7FD1AE')}</g>`,
  },
  Painter: {
    eyes: 'open',
    gear:
      r(7, 5, 10, 2, '#8E2C48') + r(6, 6, 1, 1, '#8E2C48') + r(12, 4, 1, 1, '#8E2C48') +
      `<g class="dab">${r(20, 9, 1, 1, '#7A4E2D')}${r(21, 8, 1, 1, '#7A4E2D')}${r(22, 7, 1, 1, '#E5533D', 'paint')}</g>`,
    side: r(0, 11, 4, 2, '#C9A06B') + r(0, 11, 1, 1, '#E5533D') + r(2, 11, 1, 1, '#3A7BD5') + r(1, 12, 1, 1, '#F5C542'),
  },
}

/** One subagent's crab, 24x16 units: walking while it works, resting once done. */
export const agentSprite = (design: number, mood: CrabMood): string => {
  const c = COSTUMES[DESIGNS[design % DESIGNS.length] ?? 'Wizard']
  const body = mood === 'failed' ? '#9A9A9A' : BODY
  const eyeKind: Eyes = mood === 'done' ? 'happy' : mood === 'failed' ? 'x' : c.eyes
  const inner = (c.side ?? '') + crab(4, 7, body, eyeKind, c.gear)

  return svg(24, 16, BASE_CSS, `<g class="${mood === 'working' ? 'walk' : 'still'}">${inner}</g>`)
}

const MAIN_CSS = `
.rise{animation:rise .5s steps(3) both}
@keyframes rise{0%{transform:translateY(6px);opacity:0}100%{transform:translateY(0);opacity:1}}
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
@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(3px,-4px);opacity:0}}
`

/**
 * The main session's crab, 34x16 units. Working: it pulls out a laptop, opens it
 * and types, code lines filling the screen. Idle: the laptop is shut and it dozes.
 */
export const mainSprite = (isWorking: boolean): string => {
  const ox = 1
  const oy = 6
  const torso =
    r(ox + 2, oy, 12, 6, BODY) +
    `<g class="blink">${r(ox + 6, oy + 2, 1, 2, EYE)}${r(ox + 11, oy + 2, 1, 2, EYE)}</g>`
  const legs =
    r(ox + 3, oy + 6, 1, 2, BODY) + r(ox + 5, oy + 6, 1, 2, BODY) +
    r(ox + 10, oy + 6, 1, 2, BODY) + r(ox + 12, oy + 6, 1, 2, BODY)

  if (!isWorking) {
    const z = (cls: string) =>
      `<text x="17" y="6" font-size="4" font-family="monospace" fill="#9AA3AD" class="${cls}">z</text>`
    return svg(
      34,
      16,
      MAIN_CSS,
      torso + r(ox, oy + 2, 2, 2, BODY) + r(ox + 14, oy + 2, 2, 2, BODY) + legs +
        r(18, 12, 14, 2, '#9AA3AD') + r(18, 12, 14, 1, '#C3CAD2') + z('zz') + z('zz d'),
    )
  }

  const arms =
    `<g class="tap">${r(ox, oy + 2, 2, 2, BODY)}</g>` +
    `<g class="tap d">${r(ox + 14, oy + 3, 4, 1, BODY)}${r(ox + 14, oy + 2, 2, 1, BODY)}</g>`
  const laptop =
    `<g class="rise">` +
    r(17, 13, 15, 1, '#9AA3AD') + r(18, 12, 13, 1, '#C3CAD2') +
    `<g class="open">${r(19, 2, 11, 10, '#3C4048')}${r(20, 3, 9, 8, '#14202E')}` +
    r(21, 4, 5, 1, '#7FD1AE', 'line l1') + r(22, 6, 6, 1, '#79A8FF', 'line l2') +
    r(21, 8, 4, 1, '#F2B36B', 'line l3') + r(26, 8, 1, 1, '#FFFFFF', 'cur') +
    `</g></g>`

  return svg(34, 16, MAIN_CSS, laptop + torso + arms + legs)
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
