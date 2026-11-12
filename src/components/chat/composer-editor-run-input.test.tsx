// SOURCING: bun:test over happy-dom with the repo's render helpers (test/blocks/render); assistant-ui's local runtime holds a response open, and the run-input queue (src/lib/theorem/run-input) is the real one with its sender mocked. Nothing is hand-rolled: this joins the Crepe composer's keys to the queue the busy form feeds.
import { act, useEffect } from 'react'
import { afterEach, expect, mock, test } from 'bun:test'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useAui,
  useLocalRuntime,
} from '@assistant-ui/react'
import type { AssistantRuntime, ChatModelAdapter } from '@assistant-ui/react'
import { ComposerEditor } from './composer-editor'
import {
  RunInputStatus,
  useBusyComposerInput,
  useRunInputSendDisabled,
} from './run-input'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { createRunInputQueue } from '@/lib/theorem/run-input'
import {
  registerRunInputQueue,
  useRunInputs,
} from '@/lib/theorem/run-input-store'

let runtime: AssistantRuntime
let runs = 0
let release: (() => void) | undefined
const send = mock(async (_runId: string, text: string, _key: string) => ({
  inputId: `input-${send.mock.calls.length}`,
  text,
  status: 'queued' as const,
}))

const adapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    runs++
    yield { content: [{ type: 'text', text: 'Working…' }] }
    await new Promise<void>((resolve) => {
      release = resolve
      abortSignal.addEventListener('abort', () => resolve(), { once: true })
    })
    if (!abortSignal.aborted)
      yield { status: { type: 'complete', reason: 'stop' } }
  },
}

/** The thread's composer form as thread.aui.tsx wires it: the busy handler on the form, the editor inside. */
function Composer({ local }: { local: AssistantRuntime }) {
  const aui = useAui()
  const sendDisabled = useRunInputSendDisabled()
  const input = useBusyComposerInput({
    hasReferences: () => false,
    onError: () => {},
  })
  useEffect(() => {
    runtime = local
    const key = aui.threadListItem.getState().id
    const queue = createRunInputQueue({
      snapshot: () => ({
        ...runtime.thread.getState(),
        threadId: 'thread-1',
        runId: 'run-1',
        inputs: [],
      }),
      refresh: async () => ({ active: true, runId: 'run-1', inputs: [] }),
      send,
      receipts: async () => [],
      append: (text) => runtime.thread.append(text),
      changed: (items) => useRunInputs.setState({ [key]: items }),
      describeError: () => 'Request failed.',
    })
    const unregister = registerRunInputQueue(key, queue)
    const stop = runtime.thread.subscribe(queue.observe)
    return () => {
      stop()
      unregister()
    }
  }, [aui, local])
  return (
    <ComposerPrimitive.Root
      onSubmit={(event) => {
        input.onSubmit(event)
      }}
      onKeyDown={input.onKeyDown}
    >
      <RunInputStatus />
      <ComposerEditor label="Message input" />
      <button type="submit" disabled={sendDisabled}>
        Send
      </button>
    </ComposerPrimitive.Root>
  )
}

function Harness() {
  const local = useLocalRuntime(adapter)
  return (
    <AssistantRuntimeProvider runtime={local}>
      <Composer local={local} />
    </AssistantRuntimeProvider>
  )
}

async function open() {
  runs = 0
  send.mockClear()
  const { container } = await render(<Harness />)
  const editor = await waitFor(() =>
    container.querySelector<HTMLElement>(
      '.ProseMirror[aria-label="Message input"]',
    ),
  )
  await act(async () => {
    runtime.thread.append('Start the work')
  })
  expect(runtime.thread.getState().isRunning).toBe(true)
  return { container, editor }
}

async function draft(editor: HTMLElement, text: string) {
  await act(async () => {
    runtime.thread.composer.setText(text)
  })
  await waitFor(() => editor.textContent === text)
}

const key = (editor: HTMLElement, init: KeyboardEventInit) =>
  act(async () => {
    editor.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  })

afterEach(async () => {
  await act(async () => {
    release?.()
  })
  release = undefined
  await cleanup()
})

test('Ctrl+Enter and Cmd+Enter in the editor send into the running response, one message each', async () => {
  const { container, editor } = await open()

  await draft(editor, 'Use the smaller design')
  await key(editor, { ctrlKey: true })
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.slice(0, 2)).toEqual([
    'run-1',
    'Use the smaller design',
  ])
  await waitFor(() => editor.textContent === '')
  expect(runtime.thread.composer.getState().text).toBe('')

  // A second message while the first is still listed: the queue takes both.
  await draft(editor, 'And keep the header')
  await key(editor, { metaKey: true })
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[1]?.slice(0, 2)).toEqual([
    'run-1',
    'And keep the header',
  ])
  expect(
    container.querySelectorAll('[data-slot="pending-run-input"]'),
  ).toHaveLength(2)

  // Neither started a response of its own or stopped the one in flight.
  expect(runs).toBe(1)
  expect(runtime.thread.getState().isRunning).toBe(true)
})

test('plain Enter during a running response edits the document and sends nothing', async () => {
  const { editor } = await open()
  await draft(editor, 'Keep writing')
  await key(editor, {})
  expect(send).toHaveBeenCalledTimes(0)
  expect(runs).toBe(1)
  expect(editor.querySelectorAll('p').length).toBeGreaterThan(1)
  expect(runtime.thread.composer.getState().text).toContain('Keep writing')
})
