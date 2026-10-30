// Claude's own task list, as the band counts it: the desktop app's pinned list
// (update_plan, checked off by wrap_up), and the terminal's todo list (TodoWrite) and
// tasks (TaskCreate, TaskUpdate). Each function gives the list after one tool's call.

import type { PlanTask } from '../types'

/** A tool call's arguments, read loosely: a tool's schema can change under the mod. */
export type Args = Record<string, unknown>

type Status = PlanTask['status']
const STATUSES: readonly string[] = ['pending', 'in_progress', 'completed']

const isArgs = (v: unknown): v is Args => typeof v === 'object' && v !== null
const statusOf = (s: unknown): Status => (typeof s === 'string' && STATUSES.includes(s) ? (s as Status) : 'pending')

/** A list a tool sent whole, each task's words under `field`; undefined when it sent none. */
function listOf(items: unknown, field: string): PlanTask[] | undefined {
  if (!Array.isArray(items)) return undefined
  return items.flatMap((item: unknown) => {
    const content = isArgs(item) ? item[field] : undefined
    return typeof content === 'string' && isArgs(item) ? [{ content, status: statusOf(item.status) }] : []
  })
}

/**
 * The pinned list after an update_plan call, its parts in this order: a whole new list
 * (`items`), steps checked off by number (`done`), the step in hand checked off and the
 * next pending one begun (`advance`), a step begun (`start`). Numbers count from 1.
 */
export function afterUpdatePlan(tasks: PlanTask[], e: Args): PlanTask[] {
  let list = listOf(e.items, 'content') ?? tasks
  const mark = (n: number, status: Status) => {
    list = list.map((t, i) => (i === n - 1 ? { ...t, status } : t))
  }
  if (Array.isArray(e.done)) for (const n of e.done) if (typeof n === 'number') mark(n, 'completed')
  if (e.advance === true) {
    const at = list.findIndex(t => t.status === 'in_progress')
    if (at >= 0) mark(at + 1, 'completed')
    const after = list.findIndex((t, i) => i > at && t.status === 'pending')
    const next = after >= 0 ? after : list.findIndex(t => t.status === 'pending')
    if (next >= 0) mark(next + 1, 'in_progress')
  }
  if (typeof e.start === 'number') mark(e.start, 'in_progress')
  return list
}

/** wrap_up checks the whole list off: the turn's work is done. */
export const afterWrapUp = (tasks: PlanTask[]): PlanTask[] => tasks.map(t => ({ ...t, status: 'completed' }))

/** The todo list after TodoWrite, which always sends it whole. */
export const afterTodoWrite = (tasks: PlanTask[], e: Args): PlanTask[] => listOf(e.todos, 'content') ?? tasks

/** The tasks after TaskCreate made one, pending, under the id its result gave it. */
export function afterTaskCreate(tasks: PlanTask[], e: Args, result: unknown): PlanTask[] {
  const id = isArgs(result) && isArgs(result.task) ? result.task.id : undefined
  if (typeof id !== 'string' || typeof e.subject !== 'string') return tasks
  return [...tasks.filter(t => t.id !== id), { id, content: e.subject, status: 'pending' }]
}

/** The tasks after TaskUpdate: its new status or subject, or the task gone once deleted. */
export function afterTaskUpdate(tasks: PlanTask[], e: Args): PlanTask[] {
  if (e.status === 'deleted') return tasks.filter(t => t.id !== e.taskId)
  return tasks.map(t => {
    if (t.id !== e.taskId) return t
    const content = typeof e.subject === 'string' ? e.subject : t.content
    return { ...t, content, status: e.status === undefined ? t.status : statusOf(e.status) }
  })
}

/** How many tasks are done, of how many. */
export const countsOf = (tasks: readonly PlanTask[]) => ({
  done: tasks.filter(t => t.status === 'completed').length,
  total: tasks.length,
})
