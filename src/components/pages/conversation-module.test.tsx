// SOURCING: bun:test over the page's Conversation module rendered with React
// into happy-dom (test/workspace's render, which supplies a QueryClient).
// Thread and the Life field are spied to stand-ins that show what the module
// hands them, so nothing reaches a Theorem.
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import type { ComponentProps } from 'react'
import { cleanup, render } from '../../../test/workspace'
import * as thread from '@/components/assistant-ui/elements/thread.aui'
import { IdePageShown } from '@/components/ide/ide-page'
import * as life from '@/components/life/life-backdrop'
import { BUILTIN_MODULES } from './builtins'
import { PageRuntimeProvider } from './page-runtime'

afterEach(() => {
  cleanup()
  mock.restore()
})

const conversation = BUILTIN_MODULES.find(
  (module) => module.id === 'theorem.conversation',
)
if (conversation?.implementation.kind !== 'builtin')
  throw new Error('The Conversation module is a built-in')
const { Component } = conversation.implementation

async function renderOnIdePage(shown: boolean) {
  spyOn(life, 'LifeBackdrop').mockImplementation(({ children }) => children)
  spyOn(thread, 'Thread').mockImplementation(
    ({ covered }: ComponentProps<typeof thread.Thread>) => (
      <p data-slot="thread">{covered ? 'covered' : 'in sight'}</p>
    ),
  )
  const { container } = await render(
    <PageRuntimeProvider>
      <IdePageShown value={shown}>
        <Component
          instanceId="conversation"
          path="conversation"
          settings={{ conversation: '' }}
          inputs={{}}
          output={() => {}}
          emit={() => {}}
          arranging={false}
        />
      </IdePageShown>
    </PageRuntimeProvider>,
  )
  return container.querySelector('[data-slot="thread"]')?.textContent
}

test('the IDE page’s conversation is out of sight while another mode covers the page', async () => {
  expect(await renderOnIdePage(false)).toBe('covered')
})

test('the IDE page’s conversation is in sight while the page shows', async () => {
  expect(await renderOnIdePage(true)).toBe('in sight')
})
