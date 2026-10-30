import { expect, test } from 'claude-code/testing'

import type { PlanTask } from '../types'
import { afterTaskCreate, afterTaskUpdate, afterTodoWrite, afterUpdatePlan, afterWrapUp, countsOf } from './plan'

const list = (...statuses: PlanTask['status'][]): PlanTask[] => statuses.map((status, i) => ({ content: `Step ${i + 1}`, status }))
const statuses = (tasks: PlanTask[]) => tasks.map(t => t.status)

test('update_plan: a whole list, steps done by number, advance and start', async () => {
  const items = [
    { content: 'Look', status: 'in_progress' },
    { content: 'Fix', status: 'pending' },
    { content: 'Bogus' },
    { status: 'pending' },
  ]
  // A step without words is dropped; one without a status counts as pending.
  expect(afterUpdatePlan(list('completed'), { items, scope: 'first_task' })).toEqual([
    { content: 'Look', status: 'in_progress' },
    { content: 'Fix', status: 'pending' },
    { content: 'Bogus', status: 'pending' },
  ])
  // advance: the step in hand done, the next pending begun.
  expect(statuses(afterUpdatePlan(list('completed', 'in_progress', 'pending', 'pending'), { advance: true }))).toEqual([
    'completed',
    'completed',
    'in_progress',
    'pending',
  ])
  // With no step in hand, advance begins the first pending one; past the last, it only checks off.
  expect(statuses(afterUpdatePlan(list('pending', 'pending'), { advance: true }))).toEqual(['in_progress', 'pending'])
  expect(statuses(afterUpdatePlan(list('completed', 'in_progress'), { advance: true }))).toEqual(['completed', 'completed'])
  // done and start count from 1; a number off the list changes nothing.
  expect(statuses(afterUpdatePlan(list('in_progress', 'pending', 'pending'), { done: [1, 2, 9], start: 3 }))).toEqual([
    'completed',
    'completed',
    'in_progress',
  ])
})

test('wrap_up checks everything off', async () => {
  expect(statuses(afterWrapUp(list('completed', 'in_progress', 'pending')))).toEqual(['completed', 'completed', 'completed'])
})

test('the terminal\'s todos come whole; its tasks one by one, by id', async () => {
  const todos = afterTodoWrite([], {
    todos: [
      { content: 'A', status: 'completed', activeForm: 'Doing A' },
      { content: 'B', status: 'in_progress', activeForm: 'Doing B' },
    ],
  })
  expect(countsOf(todos)).toEqual({ done: 1, total: 2 })

  let tasks = afterTaskCreate([], { subject: 'Read', description: 'r' }, { task: { id: '1', subject: 'Read' } })
  tasks = afterTaskCreate(tasks, { subject: 'Write', description: 'w' }, { task: { id: '2', subject: 'Write' } })
  // A create the tool refused (no id back) adds nothing.
  tasks = afterTaskCreate(tasks, { subject: 'Lost', description: 'l' }, undefined)
  expect(countsOf(tasks)).toEqual({ done: 0, total: 2 })
  tasks = afterTaskUpdate(tasks, { taskId: '1', status: 'completed', subject: 'Read it all' })
  expect(tasks[0]).toEqual({ id: '1', content: 'Read it all', status: 'completed' })
  tasks = afterTaskUpdate(tasks, { taskId: '2', status: 'deleted' })
  expect(countsOf(tasks)).toEqual({ done: 1, total: 1 })
})
