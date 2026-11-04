import { expect, test } from 'bun:test'
import { ExportedMessageRepository } from '@assistant-ui/react'
import type { ThreadMessageLike, ThreadRuntime } from '@assistant-ui/react'
import {
  AssistantRuntimeImpl,
  LocalRuntimeCore,
} from '@assistant-ui/core/internal'
import type { Theorem } from './client'
import { refreshConversation } from './conversation-refresh'

const question: ThreadMessageLike = {
  id: 'question',
  role: 'user',
  content: 'Compare the documents',
}
const answer: ThreadMessageLike = {
  id: 'answer',
  role: 'assistant',
  content: 'I started the comparison',
}

function stored(message: ThreadMessageLike, runId?: string): Theorem.Message {
  return {
    schema: 'theorem.chat.message.v1',
    messageId: message.id!,
    tenantId: 'owner',
    threadId: 'thread',
    originBranchId: 'branch',
    role: message.role,
    createdAtMs: 1,
    runId,
    parts: [
      { partId: message.id!, type: 'text', payload: { text: message.content } },
    ],
  }
}

function fixture(initial: ThreadMessageLike[] = [question, answer]) {
  const runtime = new AssistantRuntimeImpl(
    new LocalRuntimeCore(
      {
        adapters: {
          chatModel: {
            async run() {
              throw new Error('The refresh must not start a model turn')
            },
          },
        },
      },
      initial,
    ),
  )
  const imports: ExportedMessageRepository[] = []
  let override: Partial<ReturnType<ThreadRuntime['getState']>> = {}
  const thread: Pick<ThreadRuntime, 'getState' | 'export' | 'import'> = {
    getState: () => ({ ...runtime.thread.getState(), ...override }),
    export: () => runtime.thread.export(),
    import: (repository) => {
      imports.push(repository)
      runtime.thread.import(repository)
    },
  }
  const snapshot = {
    thread: { threadId: 'thread', selectedBranchId: 'branch' },
    messages: [
      stored(question),
      stored(answer, 'front-run'),
      stored(
        {
          id: 'work-answer',
          role: 'assistant',
          content: 'Here are the findings.',
        },
        'delivery-run',
      ),
    ],
  } as Theorem.ThreadSnapshot
  return {
    thread,
    runtime,
    snapshot,
    imports,
    setLoading: () => {
      override = { ...override, isLoading: true }
    },
    setRunning: () => {
      override = { ...override, isRunning: true }
    },
    changeMessages: () => {
      override = { ...override, messages: [...thread.getState().messages] }
    },
  }
}

test('a settled background answer extends an idle conversation without replacing its composer', async () => {
  const f = fixture()
  f.runtime.thread.composer.setText('Keep this unsent follow-up')
  expect(await refreshConversation(f.thread, async () => f.snapshot)).toBe(true)
  expect(
    f.runtime.thread.getState().messages.map((message) => message.id),
  ).toEqual(['question', 'answer', 'work-answer'])
  expect(f.runtime.thread.composer.getState().text).toBe(
    'Keep this unsent follow-up',
  )
})

test('a longer unrelated branch cannot replace the locally selected conversation', async () => {
  const f = fixture()
  const remote = {
    ...f.snapshot,
    messages: [
      stored(question),
      stored({
        id: 'other-answer',
        role: 'assistant',
        content: 'Other branch',
      }),
      stored({
        id: 'other-followup',
        role: 'user',
        content: 'Another question',
      }),
      stored({
        id: 'other-final',
        role: 'assistant',
        content: 'Another answer',
      }),
    ],
  }
  expect(await refreshConversation(f.thread, async () => remote)).toBe(false)
  expect(f.imports).toHaveLength(0)
  expect(f.runtime.thread.getState().messages.at(-1)?.id).toBe('answer')
})

test('a streamed local assistant head is matched by its durable run identity', async () => {
  const f = fixture([
    question,
    {
      ...answer,
      id: 'local-streamed-answer',
      metadata: { custom: { theoremRunId: 'front-run' } },
    },
  ])
  expect(await refreshConversation(f.thread, async () => f.snapshot)).toBe(true)
  expect(
    f.runtime.thread.getState().messages.map((message) => message.id),
  ).toEqual(['question', 'local-streamed-answer', 'work-answer'])
  expect(
    f.thread
      .export()
      .messages.find((entry) => entry.message.id === 'work-answer')?.parentId,
  ).toBe('local-streamed-answer')
})

test('same text or absent run IDs do not establish identity', async () => {
  for (const head of [
    { ...answer, id: 'local-unknown' },
    {
      ...answer,
      id: 'local-unknown',
      metadata: { custom: { theoremRunId: 'different-run' } },
    },
    {
      ...question,
      id: 'local-user',
      metadata: { custom: { theoremRunId: 'front-run' } },
    },
  ]) {
    const f = fixture([question, head])
    expect(await refreshConversation(f.thread, async () => f.snapshot)).toBe(
      false,
    )
    expect(f.imports).toHaveLength(0)
  }
  const empty = fixture([])
  expect(
    await refreshConversation(empty.thread, async () => empty.snapshot),
  ).toBe(false)
})

test('appending background history preserves side branches and their run configuration', async () => {
  const f = fixture()
  const initial = ExportedMessageRepository.fromBranchableArray(
    [
      { message: question, parentId: null },
      { message: answer, parentId: 'question' },
      {
        message: {
          id: 'other-answer',
          role: 'assistant',
          content: 'Another approach',
        },
        parentId: 'question',
      },
    ],
    { headId: 'answer' },
  )
  f.runtime.thread.import(initial)
  const exported = f.thread.export()
  const sibling = exported.messages.find(
    (entry) => entry.message.id === 'other-answer',
  )!
  sibling.runConfig = {
    custom: { theoremTurnOptions: { model: 'other-model' } },
  }
  f.thread.export = () => exported
  expect(await refreshConversation(f.thread, async () => f.snapshot)).toBe(true)
  expect(
    f.imports[0]?.messages.find((entry) => entry.message.id === 'other-answer'),
  ).toEqual(sibling)
  f.runtime.thread
    .getMessageById('answer')
    .switchToBranch({ branchId: 'other-answer' })
  expect(f.runtime.thread.getState().messages.at(-1)?.id).toBe('other-answer')
})

test('a user turn started during refresh wins over a background response', async () => {
  const f = fixture()
  expect(
    await refreshConversation(f.thread, async () => {
      f.setRunning()
      return f.snapshot
    }),
  ).toBe(false)
  expect(f.imports).toHaveLength(0)
})

test('a changed branch or unfinished background run is not imported', async () => {
  const f = fixture()
  expect(
    await refreshConversation(f.thread, async () => {
      f.changeMessages()
      return f.snapshot
    }),
  ).toBe(false)
  const g = fixture()
  expect(
    await refreshConversation(g.thread, async () => ({
      ...g.snapshot,
      liveRun: { runId: 'busy' } as Theorem.RunLink,
    })),
  ).toBe(false)
  expect(g.imports).toHaveLength(0)
})

test('refresh never fetches during a local run or history load', async () => {
  for (const set of ['setRunning', 'setLoading'] as const) {
    const f = fixture()
    f[set]()
    let called = false
    expect(
      await refreshConversation(f.thread, async () => {
        called = true
        return f.snapshot
      }),
    ).toBe(false)
    expect(called).toBe(false)
  }
})

test('the same head or an older snapshot never imports', async () => {
  for (const count of [1, 2]) {
    const f = fixture()
    expect(
      await refreshConversation(f.thread, async () => ({
        ...f.snapshot,
        messages: f.snapshot.messages.slice(0, count),
      })),
    ).toBe(false)
    expect(f.imports).toHaveLength(0)
  }
})

test('a new history load during refresh wins over a background response', async () => {
  const f = fixture()
  expect(
    await refreshConversation(f.thread, async () => {
      f.setLoading()
      return f.snapshot
    }),
  ).toBe(false)
  expect(f.imports).toHaveLength(0)
})

test('only nonempty run identity matches, including a valid single-character ID', async () => {
  for (const runId of ['', 'r']) {
    const f = fixture([
      question,
      {
        ...answer,
        id: 'local-run-head',
        metadata: { custom: { theoremRunId: runId } },
      },
    ])
    const remote = {
      ...f.snapshot,
      messages: [
        stored(question),
        stored(answer, runId),
        f.snapshot.messages[2]!,
      ],
    }
    expect(await refreshConversation(f.thread, async () => remote)).toBe(
      runId === 'r',
    )
  }
})

test('a one-message history can extend from its first authoritative message', async () => {
  const f = fixture([answer])
  const remote = {
    ...f.snapshot,
    messages: [stored(answer), f.snapshot.messages[2]!],
  }
  expect(await refreshConversation(f.thread, async () => remote)).toBe(true)
  expect(
    f.runtime.thread.getState().messages.map((message) => message.id),
  ).toEqual(['answer', 'work-answer'])
})

test('the latest of several local assistant messages remains the extension head', async () => {
  const completion: ThreadMessageLike = {
    id: 'local-completion',
    role: 'assistant',
    content: 'Finished',
    metadata: { custom: { theoremRunId: 'completion-run' } },
  }
  const f = fixture([question, answer, completion])
  const remote = {
    ...f.snapshot,
    messages: [
      stored(question),
      stored(answer, 'front-run'),
      stored({ ...completion, id: 'durable-completion' }, 'completion-run'),
      f.snapshot.messages[2]!,
    ],
  }
  expect(await refreshConversation(f.thread, async () => remote)).toBe(true)
  expect(
    f.runtime.thread.getState().messages.map((message) => message.id),
  ).toEqual(['question', 'answer', 'local-completion', 'work-answer'])
})

test('an optimistic head omitted from export cannot acquire an orphaned background child', async () => {
  const f = fixture([question, { ...answer, metadata: { isOptimistic: true } }])
  expect(await refreshConversation(f.thread, async () => f.snapshot)).toBe(
    false,
  )
  expect(f.imports).toHaveLength(0)
})
