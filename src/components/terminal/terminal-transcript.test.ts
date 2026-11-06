import { expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { leftoversOf, readInput, snapshotOf } from './terminal-transcript'
import type { Outgoing } from './terminal-transcript'

type Part = Record<string, unknown>

function message(role: 'user' | 'assistant', content: Part[]): ThreadMessage {
  return {
    id: `${role}-${content.length}`,
    role,
    content,
    metadata: { custom: { theoremRunId: 'run-1' } },
    status: { type: 'running' },
  } as unknown as ThreadMessage
}

/** A `user_input` part as the SDK hands it over from a run's stream. */
function input(inputId: string, text: string, status: string, reason?: string) {
  return {
    type: 'data',
    name: 'theorem-user_input',
    data: {
      type: 'user_input',
      partId: `part-${inputId}`,
      inputId,
      text,
      status,
      reason,
    },
  }
}

const tool = {
  type: 'tool-call',
  toolCallId: 'call-1',
  toolName: 'search_code',
  args: { query: 'parser' },
  argsText: '{"query":"parser"}',
}

type Drawn = {
  messages: { role: string; parts: Part[] }[]
  outgoing: Part[]
}

function draw(
  messages: ThreadMessage[],
  outbox: Outgoing[] = [],
  running = true,
) {
  return JSON.parse(
    snapshotOf(messages, running, 'theorem', outbox).json,
  ) as Drawn
}

test('input the run took is drawn where it landed, between the work around it', () => {
  const drawn = draw([
    message('user', [{ type: 'text', text: 'Fix the build' }]),
    message('assistant', [
      tool,
      input('in-1', 'skip the docs folder', 'delivered'),
    ]),
  ])
  expect(drawn.messages[1]?.parts).toEqual([
    { type: 'tool', name: 'search_code', summary: 'parser', status: 'running' },
    { type: 'input', text: 'skip the docs folder', status: 'delivered' },
  ])
})

test('a stored part without its type and id reads like a streamed one', () => {
  expect(
    readInput({
      inputId: 'in-1',
      text: 'also run the tests',
      status: 'not_delivered',
      reason: 'run_ended',
    }),
  ).toEqual({
    inputId: 'in-1',
    text: 'also run the tests',
    status: 'not_delivered',
    reason: 'run_ended',
  })
  expect(readInput({ status: 'queued' })).toBeUndefined()
})

test('what this page sent shows once: pending until its part arrives, then in place', () => {
  const outbox: Outgoing[] = [
    { id: 'a', text: 'skip the docs folder', state: 'sent', inputId: 'in-1' },
    { id: 'b', text: 'and the examples', state: 'sending' },
  ]
  const before = draw([message('assistant', [tool])], outbox)
  expect(before.outgoing).toEqual([
    { text: 'skip the docs folder', status: 'queued' },
    { text: 'and the examples', status: 'sending' },
  ])
  const after = draw(
    [
      message('assistant', [
        tool,
        input('in-1', 'skip the docs folder', 'queued'),
      ]),
    ],
    outbox,
  )
  expect(after.outgoing).toEqual([
    { text: 'and the examples', status: 'sending' },
  ])
  expect(after.messages[0]?.parts.at(-1)).toEqual({
    type: 'input',
    text: 'skip the docs folder',
    status: 'queued',
  })
})

test('undelivered input from this page says it goes as the next turn, and then that it went', () => {
  const part = input('in-1', 'rename the flag', 'not_delivered', 'run_ended')
  const sent: Outgoing = {
    id: 'a',
    text: 'rename the flag',
    state: 'sent',
    inputId: 'in-1',
  }
  expect(
    draw([message('assistant', [part])], [sent]).messages[0]?.parts[0],
  ).toMatchObject({ status: 'next' })
  expect(
    draw([message('assistant', [part])], [{ ...sent, state: 'resent' }])
      .messages[0]?.parts[0],
  ).toMatchObject({ status: 'resent' })
  // Loaded from history, not sent from here: reported, never resent.
  expect(draw([message('assistant', [part])]).messages[0]?.parts[0]).toEqual({
    type: 'input',
    text: 'rename the flag',
    status: 'not_delivered',
    reason: 'run_ended',
  })
})

test('a refused send is reported with why, and resent is no longer pending', () => {
  const drawn = draw(
    [],
    [
      {
        id: 'a',
        text: 'too late',
        state: 'failed',
        error: 'Sign in to continue.',
      },
      { id: 'b', text: 'gone already', state: 'resent' },
      { id: 'c', text: 'after the answer', state: 'next' },
    ],
  )
  expect(drawn.outgoing).toEqual([
    { text: 'too late', status: 'failed', reason: 'Sign in to continue.' },
    { text: 'after the answer', status: 'next' },
  ])
})

test('after the run, only what it never took goes as the next turn, oldest first', () => {
  const messages = [
    message('assistant', [
      input('in-1', 'delivered one', 'delivered'),
      input('in-2', 'left behind', 'not_delivered', 'run_ended'),
    ]),
  ]
  const outbox: Outgoing[] = [
    { id: 'a', text: 'delivered one', state: 'sent', inputId: 'in-1' },
    { id: 'b', text: 'left behind', state: 'sent', inputId: 'in-2' },
    { id: 'c', text: 'refused as closed', state: 'next' },
    { id: 'd', text: 'never had a run id', state: 'sending' },
    { id: 'e', text: 'still in flight', state: 'sending' },
    { id: 'f', text: 'already resent', state: 'resent' },
    { id: 'g', text: 'refused for good', state: 'failed', error: 'no' },
  ]
  expect(
    leftoversOf(messages, outbox, new Set(['e'])).map((o) => o.id),
  ).toEqual(['b', 'c', 'd'])
})

test("an answer's fenced code reaches the terminal highlighted; the person's words stay as typed", () => {
  const fenced = 'Run:\n\n```sh\nmake test\n```'
  const drawn = draw([
    message('user', [{ type: 'text', text: fenced }]),
    message('assistant', [{ type: 'text', text: fenced }]),
  ])
  expect(drawn.messages[0]?.parts).toEqual([{ type: 'text', text: fenced }])
  expect(drawn.messages[1]?.parts.map((part) => part.type)).toEqual([
    'text',
    'code',
  ])
  expect(drawn.messages[1]?.parts[1]).toMatchObject({
    type: 'code',
    lang: 'sh',
  })
})

test("the native agent's program, host calls and progress reach the terminal", () => {
  const data = (name: string, payload: Part) => ({
    type: 'data',
    name: `theorem-${name}`,
    data: payload,
  })
  const parts: Part[] = [
    data('progress', { label: 'Reading the parser' }),
    data('program', { source: 'x = 1', streaming: true }),
    data('host_call', { name: 'read_file', effect: 'read', state: 'pending' }),
    data('host_call', { name: 'search_code', effect: 'read', state: 'failed' }),
  ]
  const live = JSON.parse(
    snapshotOf([message('assistant', parts)], true, 'theorem', []).json,
  ) as Drawn & { activity?: string }
  expect(live.activity).toBe('Reading the parser')
  expect(live.messages[0]?.parts).toEqual([
    {
      type: 'program',
      lines: [[{ t: 'x = ' }, { t: '1', c: 'number' }]],
      streaming: true,
    },
    { type: 'tool', name: 'read_file', summary: 'read', status: 'running' },
    { type: 'tool', name: 'search_code', summary: 'read', status: 'error' },
  ])
  // Once the run is over, a call still pending did not finish.
  const after = draw([message('assistant', parts)], [], false)
  expect(after.messages[0]?.parts[0]).toMatchObject({ streaming: false })
  expect(after.messages[0]?.parts[1]).toEqual({
    type: 'tool',
    name: 'read_file',
    summary: 'did not finish',
    status: 'error',
  })
})
