import { z } from 'zod';
import { defineEndpoint, HouseholdParams, Id, IsoDateTime, Ok, withHousehold } from '../core.js';
import { RRuleString, Visibility } from './calendar.js';

export const TaskRecurrence = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), rrule: RRuleString }),
  z.object({
    mode: z.literal('floating'),
    interval: z.number().int().min(1).max(1000),
    unit: z.enum(['day', 'week', 'month', 'year']),
  }),
]);
export type TaskRecurrence = z.infer<typeof TaskRecurrence>;

export const Priority = z.enum(['low', 'normal', 'high']);
export const TaskStatus = z.enum(['open', 'done', 'skipped']);

export const ChecklistItem = z.object({
  id: Id,
  text: z.string().min(1).max(200),
  done: z.boolean(),
});

export const Task = z.object({
  id: Id,
  /** Instances of the same recurring chore share a series id. */
  seriesId: Id,
  title: z.string(),
  notes: z.string().nullable(),
  assigneeMemberId: Id.nullable(),
  dueAt: IsoDateTime.nullable(),
  priority: Priority,
  recurrence: TaskRecurrence.nullable(),
  rotationMemberIds: z.array(Id),
  points: z.number().int().min(0),
  checklist: z.array(ChecklistItem),
  status: TaskStatus,
  completedAt: IsoDateTime.nullable(),
  completedByMemberId: Id.nullable(),
  streak: z.number().int(),
  visibility: Visibility,
  createdByMemberId: Id,
  createdAt: IsoDateTime,
});
export type Task = z.infer<typeof Task>;

const TaskBase = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(5000).nullable(),
  assigneeMemberId: Id.nullable(),
  dueAt: IsoDateTime.nullable(),
  priority: Priority,
  recurrence: TaskRecurrence.nullable(),
  rotationMemberIds: z.array(Id).max(20),
  points: z.number().int().min(0).max(1000),
  checklist: z
    .array(z.object({ text: z.string().min(1).max(200), done: z.boolean().default(false) }))
    .max(50),
  visibility: Visibility,
});

export const CreateTaskBody = TaskBase.extend({
  notes: TaskBase.shape.notes.optional(),
  assigneeMemberId: TaskBase.shape.assigneeMemberId.optional(),
  dueAt: TaskBase.shape.dueAt.optional(),
  priority: TaskBase.shape.priority.default('normal'),
  recurrence: TaskBase.shape.recurrence.optional(),
  rotationMemberIds: TaskBase.shape.rotationMemberIds.default([]),
  points: TaskBase.shape.points.default(0),
  checklist: TaskBase.shape.checklist.default([]),
  visibility: TaskBase.shape.visibility.default('household'),
}).refine((t) => !t.recurrence || t.dueAt, {
  message: 'Recurring tasks need a due date',
  path: ['dueAt'],
});

/** Changes apply to the open instance and to future instances of the series. */
export const UpdateTaskBody = TaskBase.partial();

export const TaskListQuery = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  assigneeMemberId: Id.optional(),
  dueBefore: IsoDateTime.optional(),
});

export const CompleteTaskBody = z.object({
  /** Defaults to now; allows backdating "watered yesterday". */
  completedAt: IsoDateTime.optional(),
  skip: z.boolean().default(false),
});

export const CompleteTaskResult = z.object({ completed: Task, next: Task.nullable() });

export const ChecklistToggleBody = z.object({ done: z.boolean() });

const tags = ['tasks'];
const TaskParams = withHousehold({ taskId: Id });

export const tasksContract = {
  list: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/tasks',
    summary: 'Tasks and chores',
    tags,
    params: HouseholdParams,
    query: TaskListQuery,
    response: z.array(Task),
  }),
  get: defineEndpoint({
    method: 'GET',
    path: '/v1/households/:householdId/tasks/:taskId',
    summary: 'Task',
    tags,
    params: TaskParams,
    response: Task,
  }),
  create: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/tasks',
    summary: 'Create task/chore',
    tags,
    params: HouseholdParams,
    body: CreateTaskBody,
    response: Task,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/v1/households/:householdId/tasks/:taskId',
    summary: 'Update task',
    tags,
    params: TaskParams,
    body: UpdateTaskBody,
    response: Task,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/v1/households/:householdId/tasks/:taskId',
    summary: 'Delete task and its future instances',
    tags,
    params: TaskParams,
    response: Ok,
  }),
  complete: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/tasks/:taskId/complete',
    summary: 'Complete or skip; creates the next instance',
    tags,
    params: TaskParams,
    body: CompleteTaskBody,
    response: CompleteTaskResult,
    status: 200,
  }),
  reopen: defineEndpoint({
    method: 'POST',
    path: '/v1/households/:householdId/tasks/:taskId/reopen',
    summary: 'Undo completion',
    tags,
    params: TaskParams,
    response: Task,
    status: 200,
  }),
  toggleChecklistItem: defineEndpoint({
    method: 'PUT',
    path: '/v1/households/:householdId/tasks/:taskId/checklist/:itemId',
    summary: 'Toggle checklist item',
    tags,
    params: withHousehold({ taskId: Id, itemId: Id }),
    body: ChecklistToggleBody,
    response: Task,
  }),
} as const;
