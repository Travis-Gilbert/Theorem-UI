import { afterEach, expect, test } from 'bun:test'
import { act, useEffect } from 'react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { ComposerEditor } from './composer-editor'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'

afterEach(cleanup)

function Draft({ text }: { text: string }) {
  const aui = useAui()
  useEffect(() => aui.composer.setText(text), [aui, text])
  return null
}

function Harness({ text, sent }: { text: string; sent: AppendMessage[] }) {
  const runtime = useExternalStoreRuntime({
    messages: [],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async (message) => {
      sent.push(message)
    },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Draft text={text} />
      <ComposerPrimitive.Root>
        <ComposerEditor label="Message input" />
        <ComposerPrimitive.Send aria-label="Send message">
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

/** Edit the rendered document, then inspect the payload accepted by the runtime. */
async function appendAndSend(markdown: string, append: string) {
  const sent: AppendMessage[] = []
  const { container } = await render(<Harness text={markdown} sent={sent} />)
  const editor = await waitFor(() =>
    container.querySelector<HTMLElement>(
      '.ProseMirror[contenteditable="true"]',
    ),
  )
  await waitFor(() => editor.textContent !== '')
  await act(async () => {
    editor.querySelector('p')!.append(append)
    editor.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
    )
    await Bun.sleep(10)
  })
  const send = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Send message"]',
  )!
  await waitFor(() => !send.disabled)
  await click(send)
  await waitFor(() => sent.length)
  return sent[0]!.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
}

test('editing and sending preserves literal Markdown punctuation', async () => {
  const payload = await appendAndSend(
    'Use \\*literal\\* and \\[brackets\\](https://example.com).',
    '!',
  )
  const paragraph = fromMarkdown(payload).children[0]
  expect(paragraph?.type).toBe('paragraph')
  if (paragraph?.type !== 'paragraph') return
  expect(paragraph.children).toHaveLength(1)
  expect(paragraph.children[0]).toMatchObject({
    type: 'text',
    value: 'Use *literal* and [brackets](https://example.com).!',
  })
})

test('editing and sending preserves a hard line break', async () => {
  const payload = await appendAndSend('First line\\\nSecond line', '!')
  const paragraph = fromMarkdown(payload).children[0]
  expect(paragraph?.type).toBe('paragraph')
  if (paragraph?.type !== 'paragraph') return
  expect(paragraph.children).toMatchObject([
    { type: 'text', value: 'First line' },
    { type: 'break' },
    { type: 'text', value: 'Second line!' },
  ])
})

test('tool directives keep their protocol syntax when neighboring text is edited', async () => {
  const payload = await appendAndSend(
    'Use :tool[recall] and :tool[rustyweb_search] before answering',
    '.',
  )
  expect(payload).toBe(
    'Use :tool[recall] and :tool[rustyweb_search] before answering.',
  )
})

test('literal link syntax next to a tool directive stays literal', async () => {
  const payload = await appendAndSend(
    'Use :tool\\[recall]\\(https://example.com) literally',
    '.',
  )
  const paragraph = fromMarkdown(payload).children[0]
  expect(paragraph?.type).toBe('paragraph')
  if (paragraph?.type !== 'paragraph') return
  expect(paragraph.children).toHaveLength(1)
  expect(paragraph.children[0]).toMatchObject({
    type: 'text',
    value: 'Use :tool[recall](https://example.com) literally.',
  })
})
