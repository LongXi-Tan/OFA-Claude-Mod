// Work titles: the band names what is being worked on, not the words of the prompt.

import type { EngineInterface } from 'claude-code'

import { cleanTitle, promptTitle } from './model'
import { updateMain } from './state'

const SYSTEM = [
  'You title units of work for a progress bar.',
  'Reply with the title alone: 2 to 6 words, no quotes, no closing period.',
  'Name the work being done, not the request: "Fix login redirect loop", not "User asks about login".',
  'Write it in the language of the request.',
].join(' ')

/**
 * Names the run that began at `runId` from the prompt that began it, with one quick
 * Haiku call (a fraction of a cent). The prompt's first line stands in when the call
 * fails or `useModel` is off. The title lands only while that run is still current.
 */
export async function nameRun($: EngineInterface, text: string, runId: number, previous: string | undefined, useModel: boolean) {
  let title = ''
  if (useModel) {
    const system = previous
      ? `${SYSTEM} The work before this was titled "${previous}"; if this request carries on with it, reply with that same title.`
      : SYSTEM
    try {
      const reply = await $.model.complete({
        model: 'haiku',
        system,
        prompt: text.slice(0, 4000),
        maxTokens: 400,
        effort: 'low',
        timeoutMs: 15_000,
      })
      if (reply.isAnswered) title = cleanTitle(reply.text)
    } catch {
      // A request the engine refuses to send (a blocked model): the prompt's line stands in.
    }
  }
  if (!title) title = promptTitle(text) || 'Working'
  await updateMain($, m => (m.runStartedAt === runId ? { ...m, title } : m))
}
