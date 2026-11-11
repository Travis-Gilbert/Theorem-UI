// SOURCING: bun:test over happy-dom with the repo's render helpers (test/blocks/render); assistant-ui's external-store runtime and SimpleTextAttachmentAdapter stand in for Theorem
import { act, useEffect } from 'react'
import { afterEach, expect, test } from 'bun:test'
import {
  AssistantRuntimeProvider,
  SimpleTextAttachmentAdapter,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Thread } from '../assistant-ui/elements/thread.aui'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'

const DRAFT = `## Release notes

Ship the **composer** with *Markdown* and \`inline code\`, as the [Milkdown docs](https://milkdown.dev) describe.

- Lists stay lists
- with a second item

> A quote reads as a quote.

\`\`\`ts
const sent = composer.text
\`\`\``

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
afterEach(cleanup)

let composer: ReturnType<typeof useAui>['composer']
function Draft({ text }: { text?: string }) {
  const aui = useAui()
  useEffect(() => {
    composer = aui.composer
    if (text !== undefined) aui.composer.setText(text)
  }, [aui, text])
  return null
}

function Harness({
  text,
  sent = [],
  edited = [],
  messages = [],
}: {
  text?: string
  sent?: AppendMessage[]
  edited?: AppendMessage[]
  messages?: ThreadMessageLike[]
}) {
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async (message) => {
      sent.push(message)
    },
    onEdit: async (message) => {
      edited.push(message)
    },
    adapters: { attachments: new SimpleTextAttachmentAdapter() },
  })
  return (
    <QueryClientProvider client={client}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Draft text={text} />
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

const textOf = (message: AppendMessage) =>
  message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')

const editorOf = (container: HTMLElement, label = 'Message input') =>
  waitFor(() =>
    container.querySelector<HTMLElement>(`.ProseMirror[aria-label="${label}"]`),
  )

/** What a person's typing leaves on the page, read by the editor a moment later. */
async function typed(editor: HTMLElement, change: () => void) {
  await act(async () => {
    change()
    editor.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
    )
    await Bun.sleep(10)
  })
}

const sendButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!

test('a Markdown draft shows formatted, and goes out as the Markdown it was', async () => {
  const sent: AppendMessage[] = []
  const { container } = await render(<Harness text={DRAFT} sent={sent} />)
  const editor = await editorOf(container)
  await waitFor(() => editor.querySelector('h2'))
  expect(editor.querySelector('h2')!.textContent).toBe('Release notes')
  expect(editor.querySelector('strong')!.textContent).toBe('composer')
  expect(editor.querySelector('em')!.textContent).toBe('Markdown')
  expect(editor.querySelector('p code')!.textContent).toBe('inline code')
  expect(editor.querySelector('p a')!.getAttribute('href')).toBe(
    'https://milkdown.dev',
  )
  expect(editor.querySelectorAll('li')).toHaveLength(2)
  expect(editor.querySelector('blockquote')!.textContent).toBe(
    'A quote reads as a quote.',
  )
  // Showing it formatted is not an edit: the draft is still the text it was given.
  expect(composer.getState().text).toBe(DRAFT)
  await waitFor(() => !sendButton(container).disabled)
  await click(sendButton(container))
  await waitFor(() => sent.length)
  expect(textOf(sent[0]!)).toBe(DRAFT)
  expect(composer.getState().text).toBe('')
  expect(editor.textContent).toBe('')
})

test('an edit to a formatted draft writes Markdown, with plain text left as typed', async () => {
  const { container } = await render(
    <Harness text="Ship the **composer** in *one* go" />,
  )
  const editor = await editorOf(container)
  await waitFor(() => editor.querySelector('strong'))
  await typed(editor, () =>
    editor.querySelector('p')!.append(', snake_case * 2 < 3 [x] #1'),
  )
  expect(composer.getState().text).toBe(
    'Ship the **composer** in *one* go, snake_case * 2 < 3 [x] #1',
  )
})

test('a bare address is sent as it was typed, not as a Markdown link', async () => {
  const { container } = await render(<Harness text="" />)
  const editor = await editorOf(container)
  await typed(editor, () => {
    editor.querySelector('p')!.textContent =
      'Read https://milkdown.dev/docs first'
  })
  expect(composer.getState().text).toBe('Read https://milkdown.dev/docs first')
})

test('the input has a name, a role and its placeholder for assistive technology', async () => {
  const { container } = await render(<Harness text="" />)
  const editor = await editorOf(container)
  expect(editor.getAttribute('role')).toBe('textbox')
  expect(editor.getAttribute('aria-multiline')).toBe('true')
  expect(editor.getAttribute('contenteditable')).toBe('true')
  expect(editor.getAttribute('aria-placeholder')).toBe(
    'Message Theorem, / for tools',
  )
  // Crepe's block handle, slash menu and top bar are switched off, not hidden.
  expect(container.querySelector('.milkdown-block-handle')).toBeNull()
  expect(container.querySelector('.milkdown-slash-menu')).toBeNull()
  expect(container.querySelector('.milkdown-top-bar')).toBeNull()
})

test('editing an earlier message opens it in the editor and resends the changed Markdown', async () => {
  const edited: AppendMessage[] = []
  const { container } = await render(
    <Harness
      edited={edited}
      messages={[
        {
          id: 'u1',
          role: 'user',
          content: [{ type: 'text', text: 'Compare **Chrome** and Firefox' }],
        },
      ]}
    />,
  )
  await click(
    await waitFor(() => container.querySelector('.aui-user-action-edit')),
  )
  const editor = await editorOf(container, 'Edit message')
  await waitFor(() => editor.querySelector('strong'))
  expect(editor.textContent).toBe('Compare Chrome and Firefox')
  await typed(editor, () => editor.querySelector('p')!.append(' on Linux'))
  await click(buttonNamed(container, 'Send')!)
  await waitFor(() => edited.length)
  expect(textOf(edited[0]!)).toBe('Compare **Chrome** and Firefox on Linux')
  expect(edited[0]!.parentId).toBeNull()
})

test('a file pasted into the editor becomes an attachment, and its text stays out', async () => {
  const { container } = await render(<Harness text="" />)
  const editor = await editorOf(container)
  const paste = Object.assign(new Event('paste', { bubbles: true }), {
    clipboardData: {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
    },
  })
  await act(async () => {
    editor.dispatchEvent(paste)
  })
  await waitFor(() => composer.getState().attachments.length)
  expect(composer.getState().attachments[0]!.name).toBe('notes.txt')
  expect(composer.getState().text).toBe('')
})

test('Enter in an empty editor still submits the form, and a writer can clear the text', async () => {
  const sent: AppendMessage[] = []
  const { container } = await render(<Harness text="" sent={sent} />)
  const editor = await editorOf(container)
  let submits = 0
  const form = editor.closest('form')!
  form.addEventListener('submit', () => submits++)
  await act(async () => {
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    )
  })
  // The form hears the submit, so a handler of its own can answer it; with
  // nothing to send, assistant-ui sends nothing.
  expect(submits).toBe(1)
  expect(sent).toHaveLength(0)

  await typed(editor, () => {
    editor.querySelector('p')!.textContent = 'A reply to the review'
  })
  expect(composer.getState().text).toBe('A reply to the review')
  await act(async () => composer.setText(''))
  await waitFor(() => editor.textContent === '')
  expect(composer.getState().text).toBe('')
})
