import { act } from 'react'
import { afterEach, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route } from '@/routes/settings/ai'
import { useGenerationDefaults } from '@/lib/theorem/generation'
import { buttonNamed, cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { ResponsesSection } from './responses-section'

afterEach(async () => {
  await cleanup()
  useGenerationDefaults.setState({ defaults: {}, onServer: undefined })
})

const defaults = () => useGenerationDefaults.getState().defaults

/** Types into a controlled input the way a person does, then leaves it, which is when a number field commits. */
async function enter(input: HTMLInputElement, text: string) {
  await act(async () => {
    input.focus()
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.blur()
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

test('the AI settings page has a Responses section', async () => {
  const Component = Route.options.component!
  const { container } = await render(
    <QueryClientProvider client={new QueryClient()}>
      <Component />
    </QueryClientProvider>,
  )
  expect(container.textContent).toContain('Responses')
  expect(container.textContent).toContain('Maximum output per call')
})

test('response detail is set, and set back to the default, from the section', async () => {
  const { container } = await render(<ResponsesSection />)
  await click(buttonNamed(container, 'Thorough')!)
  expect(defaults().responseDetail).toBe('thorough')
  await click(buttonNamed(container, 'Default')!)
  expect(defaults().responseDetail).toBeUndefined()
})

test('the per-call maximum and the run budget are numbers, and an emptied field is unset', async () => {
  const { container } = await render(<ResponsesSection />)
  const field = (label: string) => container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!

  await enter(field('Maximum output per call'), '4000')
  await waitFor(() => defaults().maxOutputTokens === 4000)
  await enter(field('Run budget output tokens'), '20000')
  await enter(field('Run budget steps'), '6')
  await waitFor(() => defaults().runBudget?.maxSteps === 6)
  expect(defaults()).toEqual({ maxOutputTokens: 4000, runBudget: { maxOutputTokens: 20000, maxSteps: 6 } })

  await enter(field('Run budget steps'), '')
  await waitFor(() => defaults().runBudget?.maxSteps === undefined)
  expect(defaults().runBudget).toEqual({ maxOutputTokens: 20000 })
})

test('it says where the defaults are kept', async () => {
  useGenerationDefaults.setState({ onServer: true })
  const { container, rerender } = await render(<ResponsesSection />)
  expect(container.textContent).toContain('Saved with your account.')
  useGenerationDefaults.setState({ onServer: false })
  await rerender(<ResponsesSection />)
  await waitFor(() => container.textContent.includes('saved on this browser'))
})
