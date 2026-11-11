import { afterEach, expect, mock, test } from 'bun:test'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useAui,
  useLocalRuntime,
} from '@assistant-ui/react'
import type { AssistantRuntime, ChatModelAdapter } from '@assistant-ui/react'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { createRunInputQueue } from '@/lib/theorem/run-input'
import { registerRunInputQueue, useRunInputs } from '@/lib/theorem/run-input-store'
import { RunInputStatus, useBusyComposerInput, useRunInputSendDisabled } from './run-input'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let container: HTMLDivElement
let runtime: AssistantRuntime
let runSignal: AbortSignal
let runs = 0
let references = false
let preventEnter = false
let runId: string | undefined = 'run-1'
let threadId: string | undefined = 'thread-1'
let release: (() => void) | undefined
const send = mock(async (_runId: string, text: string, _key: string) =>
  ({ inputId: 'input-1', text, status: 'queued' as const }))
const showError = mock((_message: string) => {})

const adapter: ChatModelAdapter = {
  async *run({ abortSignal }) {
    runSignal = abortSignal
    runs++
    yield { content: [{ type: 'text', text: 'Working…' }] }
    await new Promise<void>((resolve) => {
      release = resolve
      abortSignal.addEventListener('abort', resolve as () => void, { once: true })
    })
    if (!abortSignal.aborted) yield { status: { type: 'complete', reason: 'stop' } }
  },
}

function Composer() {
  const aui = useAui()
  const sendDisabled = useRunInputSendDisabled()
  const input = useBusyComposerInput({ hasReferences: () => references, onError: showError })
  useEffect(() => {
    const key = aui.threadListItem.getState().id
    const queue = createRunInputQueue({
      snapshot: () => ({ ...runtime.thread.getState(), threadId, runId, inputs: [] }),
      refresh: async () => ({ active: true, runId, inputs: [] }),
      send,
      receipts: async () => [],
      append: (text) => runtime.thread.append(text),
      changed: (items) => useRunInputs.setState({ [key]: items }),
      describeError: () => 'Request failed.',
    })
    const unregister = registerRunInputQueue(key, queue)
    const stop = runtime.thread.subscribe(queue.observe)
    return () => { stop(); unregister() }
  }, [aui])
  return (
    <ComposerPrimitive.Root onSubmit={(event) => { input.onSubmit(event) }} onKeyDown={input.onKeyDown}>
      <RunInputStatus />
      <ComposerPrimitive.Input aria-label="Message" onKeyDown={(event) => { if (preventEnter) event.preventDefault() }} />
      <button type="submit" disabled={sendDisabled}>Send</button>
      <ComposerPrimitive.Cancel aria-label="Stop">Stop</ComposerPrimitive.Cancel>
    </ComposerPrimitive.Root>
  )
}

function Harness() {
  runtime = useLocalRuntime(adapter)
  return <AssistantRuntimeProvider runtime={runtime}><Composer /></AssistantRuntimeProvider>
}

async function open() {
  runs = 0
  references = false
  preventEnter = false
  threadId = 'thread-1'
  runId = 'run-1'
  send.mockClear()
  showError.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<Harness />) })
  await act(async () => { runtime.thread.append('Start the work') })
  expect(runtime.thread.getState().isRunning).toBe(true)
}

afterEach(async () => {
  await act(async () => { release?.(); root?.unmount() })
  root = undefined
  release = undefined
  container?.remove()
})

async function draft(text: string) {
  await act(async () => { runtime.thread.composer.setText(text) })
}
const sendButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!
const textarea = () => container.querySelector('textarea')!

test('click sends additional text through the inbox while the original stream keeps running', async () => {
  await open()
  await draft('Use the smaller design')
  expect(sendButton().disabled).toBe(false)
  await act(async () => { sendButton().click() })
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.slice(0, 2)).toEqual(['run-1', 'Use the smaller design'])
  expect(runtime.thread.composer.getState().text).toBe('')
  expect(runtime.thread.getState().isRunning).toBe(true)
  expect(runSignal.aborted).toBe(false)
  expect(runs).toBe(1)
  expect(container.textContent).toContain('Queued for the next step')
})

test('Enter submits busy text exactly once through the same form boundary', async () => {
  await open()
  await draft('Keep going with the revised plan')
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(runtime.thread.composer.getState().text).toBe('')
  expect(runSignal.aborted).toBe(false)
  expect(runs).toBe(1)
})

test('blank drafts, Shift+Enter, composition and handled tool-selection events do not submit', async () => {
  await open()
  await draft(' ')
  await act(async () => { sendButton().click() })
  await draft('Keep this draft')
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))
  })
  preventEnter = true
  await act(async () => {
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  expect(send).not.toHaveBeenCalled()
  expect(runtime.thread.composer.getState().text).toBe('Keep this draft')
  expect(runSignal.aborted).toBe(false)
})

test('context that the native text inbox cannot carry stays in the draft with a clear explanation', async () => {
  await open()
  references = true
  await draft('Read the attached document')
  await act(async () => { sendButton().click() })
  expect(send).not.toHaveBeenCalled()
  expect(runtime.thread.composer.getState().text).toBe('Read the attached document')
  expect(showError.mock.calls[0]?.[0]).toContain('text only')
  expect(runSignal.aborted).toBe(false)
})

test('Stop is still an explicit separate cancellation action', async () => {
  await open()
  await draft('Use the smaller design')
  await act(async () => { sendButton().click() })
  expect(runSignal.aborted).toBe(false)
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click() })
  expect(runSignal.aborted).toBe(true)
  expect(runs).toBe(1)
})

test('an idle composer still uses the ordinary adapter once', async () => {
  await open()
  await act(async () => { release?.() })
  expect(runtime.thread.getState().isRunning).toBe(false)
  await draft('Start the next response')
  await act(async () => { sendButton().click() })
  expect(runs).toBe(2)
  expect(send).not.toHaveBeenCalled()
  expect(runtime.thread.composer.getState().text).toBe('')
})

test('Escape also pauses waiting input before cancelling, even before the first run ID', async () => {
  await open()
  runId = undefined
  threadId = undefined
  await draft('Keep this extra instruction')
  await act(async () => { sendButton().click() })
  expect(send).not.toHaveBeenCalled()
  await act(async () => {
    textarea().focus()
    textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })
  expect(runSignal.aborted).toBe(true)
  expect(container.textContent).toContain('The response stopped before this message was delivered.')
  expect(container.textContent).toContain('Retry')
  expect(runs).toBe(1)
})
