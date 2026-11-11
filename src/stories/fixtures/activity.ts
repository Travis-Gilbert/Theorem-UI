// SOURCING: none: one question and the reply to it in each state the activity line has, in the SDK's own message shape.
import type { Theorem } from '@/lib/theorem/client'

export const ACTIVITY_STATES = [
  'working',
  'approval',
  'finished',
  'stopped',
  'unfinished',
] as const

export type ActivityState = (typeof ACTIVITY_STATES)[number]

const ASKED_AT = Date.UTC(2026, 10, 10, 15)

const message = (
  messageId: string,
  role: Theorem.MessageRole,
  createdAtMs: number,
  parts: Theorem.StoredPart[],
): Theorem.Message => ({
  schema: 'theorem.chat.message.v1',
  messageId,
  tenantId: 'story',
  threadId: 'thread-activity',
  originBranchId: 'branch-main',
  role,
  parts,
  createdAtMs,
})

const said = (partId: string, text: string): Theorem.StoredPart => ({
  partId,
  type: 'text',
  payload: { text },
})

const step = (
  partId: string,
  label: string,
  status: string,
): Theorem.StoredPart => ({
  partId,
  type: 'progress',
  payload: { label, status },
})

const call = (
  toolCallId: string,
  toolName: string,
  safeArguments: Record<string, unknown>,
): Theorem.StoredPart => ({
  partId: `${toolCallId}-call`,
  type: 'tool_call',
  payload: { toolCallId, toolName, safeArguments },
})

const result = (
  toolCallId: string,
  safeOutput: Record<string, unknown>,
): Theorem.StoredPart => ({
  partId: `${toolCallId}-result`,
  type: 'tool_result',
  payload: { toolCallId, status: 'complete', safeOutput },
})

/** The question, then the reply that arrived 42 seconds later, as far as it got in `state`. */
export function activityMessages(state: ActivityState): Theorem.Message[] {
  const live = state === 'working' || state === 'approval'
  const build = { command: 'bun run build:examples' }
  return [
    message('activity-ask', 'user', ASKED_AT, [
      said('activity-ask-text', 'Which of the gallery examples still build?'),
    ]),
    message('activity-answer', 'assistant', ASKED_AT + 42_000, [
      step('activity-step-read', 'Reading the gallery', 'complete'),
      {
        partId: 'activity-reasoning',
        type: 'reasoning',
        payload: {
          text: 'Each example names its entry file, so building them one at a time shows which still resolve.',
        },
      },
      call('activity-search', 'web_search', {
        query: 'vite 8 breaking changes',
      }),
      result('activity-search', {
        query: 'vite 8 breaking changes',
        hits: [],
      }),
      step(
        'activity-step-check',
        'Checking the examples',
        live ? 'running' : state === 'unfinished' ? 'failed' : 'complete',
      ),
      call('activity-build', 'bash', build),
      ...(state === 'approval'
        ? [
            {
              partId: 'activity-approval',
              type: 'tool_approval',
              payload: {
                approvalId: 'approval-build',
                toolCallId: 'activity-build',
                toolName: 'bash',
                summary: 'Allow bash to build the examples?',
                risk: 'medium',
                status: 'requires_action',
              },
            } satisfies Theorem.StoredPart,
          ]
        : state === 'working'
          ? []
          : [result('activity-build', { exitCode: 0, built: 11, failed: 1 })]),
      ...(state === 'finished'
        ? [
            said(
              'activity-answer-text',
              'Eleven of the twelve build. The map example imports a tile helper that moved.',
            ),
          ]
        : []),
    ]),
  ]
}

const hostCall = (name: string, state: string): Theorem.StoredPart => ({
  partId: `pill-${name}`,
  type: 'host_call',
  payload: { name, effect: 'read', state },
})

/** A reply still at work whose program called host functions: two done, one failed, one running. */
export function toolPillMessages(): Theorem.Message[] {
  return [
    message('pills-ask', 'user', ASKED_AT, [
      said('pills-ask-text', 'What did we decide about graph memory?'),
    ]),
    message('pills-answer', 'assistant', ASKED_AT + 9_000, [
      hostCall('search_memory', 'resolved'),
      hostCall('search_history', 'resolved'),
      hostCall('kit_gesture', 'failed'),
      hostCall('read_document', 'pending'),
    ]),
  ]
}

/** A finished reply that searched, then checked the App it wrote and found two problems. */
export function appCheckMessages(): Theorem.Message[] {
  return [
    message('check-ask', 'user', ASKED_AT, [
      said('check-ask-text', 'Add a total row to the budget App.'),
    ]),
    message('check-answer', 'assistant', ASKED_AT + 9_000, [
      hostCall('search_library', 'resolved'),
      {
        partId: 'check-app',
        type: 'client_operation',
        payload: {
          operation: 'app.check',
          state: 'answered',
          receipt: {
            outcome: 'applied',
            result: {
              built: true,
              omitted: 0,
              problems: [
                {
                  kind: 'type',
                  file: 'App.tsx',
                  line: 42,
                  message: "Property 'total' does not exist on type 'Row'.",
                },
                {
                  kind: 'type',
                  file: 'rows.ts',
                  line: 7,
                  message: "Type 'string' is not assignable to type 'number'.",
                },
              ],
            },
          },
        },
      },
      said(
        'check-answer-text',
        'The total row is in, with two type problems left to fix.',
      ),
    ]),
  ]
}
