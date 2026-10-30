// Pure helpers: prices, formats and titles. Nothing here touches `$`.

import type { ModelUsage } from 'claude-code'

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

export const costOf = (model: string, u: ModelUsage): number => {
  const [i, o, rd, w] = PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? OPUS_5_5
  return (
    (u.input_tokens * i + u.output_tokens * o + u.cache_read_input_tokens * rd + u.cache_creation_input_tokens * w) /
    1e6
  )
}

export const tokensOf = (u: ModelUsage) =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

export const windowOf = (model: string) => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

/** `claude-opus-5-5[1m]` reads as `Opus 5.5`. */
export const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id || 'model'
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

export const fmtTokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

export const fmtCost = (usd: number) => `≈$${usd >= 10 ? usd.toFixed(1) : usd.toFixed(2)}`

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** A title out of a model's reply: its first line, without quotes, markup, a label or a closing period. */
export const cleanTitle = (reply: string): string =>
  (reply.trim().split('\n')[0] ?? '')
    .replace(/^#+\s*/, '')
    .replace(/^(title|task)\s*[:：]\s*/i, '')
    .replace(/^["'`*_“”‘’「『]+|["'`*_“”‘’」』]+$/g, '')
    .replace(/[.。]+$/, '')
    .trim()
    .slice(0, 60)

/** What names a run when no model does: the prompt's first plain line, cut short. */
export const promptTitle = (text: string): string => {
  const line =
    text
      .split('\n')
      .map(l => l.trim())
      .find(l => l !== '' && !l.startsWith('<') && !l.startsWith('[Image')) ?? ''
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line
}
