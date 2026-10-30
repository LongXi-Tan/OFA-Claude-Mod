// The values the band and the pane draw from, held by the host for the session.
// Every read and write goes through this file: the engine's scan reads a state atom
// only in the file that declares it.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentRow, MainState, PanelState, PlanState } from '../types'

export const PANE = 'progress-bar'
/** Rows kept; the oldest drop off past it. */
export const KEEP = 60

export const EMPTY_MAIN: MainState = { isWorking: false, turnStartedAt: 0, workMs: 0, tokens: 0, costUsd: 0, model: '' }
export const EMPTY_PLAN: PlanState = { tasks: [] }

// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload. Fields added as optional keep the tag.
const agents = atom({ plugin: 'progress-bar', key: 'agents' } as const, [] as AgentRow[], { shape: 'agents-1' })
const main = atom({ plugin: 'progress-bar', key: 'main' } as const, EMPTY_MAIN, { shape: 'main-1' })
const plan = atom({ plugin: 'progress-bar', key: 'plan' } as const, EMPTY_PLAN, { shape: 'plan-1' })
const now = atom({ plugin: 'progress-bar', key: 'now' } as const, 0)
const panel = atom({ plugin: 'progress-bar', key: 'panel' } as const, { isDoneCollapsed: false } as PanelState)

// Reads made while drawing subscribe the drawing: a later write redraws it.
export function readAgents($: EngineInterface) {
  return read($, agents)
}
export function readMain($: EngineInterface) {
  return read($, main)
}
export function readPlan($: EngineInterface) {
  return read($, plan)
}
export function readPanel($: EngineInterface) {
  return read($, panel)
}
export function readNow($: EngineInterface) {
  return read($, now)
}

// Writes read, apply and write again on a version miss, so `fn` may run more than once.
export function updateAgents($: EngineInterface, fn: (rows: AgentRow[]) => AgentRow[]) {
  return update($, agents, fn)
}
export function updateMain($: EngineInterface, fn: (m: MainState) => MainState) {
  return update($, main, fn)
}
export function updatePlan($: EngineInterface, fn: (p: PlanState) => PlanState) {
  return update($, plan, fn)
}
export function updatePanel($: EngineInterface, fn: (p: PanelState) => PanelState) {
  return update($, panel, fn)
}
export function setNow($: EngineInterface, at: number) {
  return update($, now, () => at)
}

/** When the band's run began: the person's prompt, or the turn when no prompt marked one. */
export const runStart = (m: MainState) => m.runStartedAt ?? m.turnStartedAt

/**
 * Whether the run has begun but its first turn has not: the moment between the person's
 * Enter and the turn. It counts as working, or the band would flash Done as a run begins.
 */
export const isPending = (m: MainState) => m.runStartedAt !== undefined && m.turnStartedAt < m.runStartedAt

export function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Agents' })
}

/**
 * The band's ×N: closes the pane when it is on screen, else brings it there. The engine's
 * list says which, not a flag of ours: the person also closes the pane by its own mark.
 * One open but not placed (opened unasked on a narrow screen) is opened, so it draws; one
 * placed behind another tab is closed and opened again, which brings it to the front.
 */
export async function togglePane($: EngineInterface) {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isPlaced && pane.isShown) return $.ui.close({ id: PANE })
  if (pane?.isPlaced) await $.ui.close({ id: PANE })
  await openPane($)
}
