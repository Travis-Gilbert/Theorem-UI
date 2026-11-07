import { afterEach, expect, spyOn, test } from 'bun:test'
import { useState } from 'react'
import { cleanup, click, render, waitFor } from '../../test/blocks/render'
import { useCopyToClipboard } from './use-copy-to-clipboard'

afterEach(cleanup)

function CopyControl({
  value,
  report = true,
}: {
  value: string
  report?: boolean
}) {
  const [error, setError] = useState('')
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    copiedDuration: 20,
    onError: report ? (failure) => setError(String(failure)) : undefined,
  })
  return (
    <div>
      <button onClick={() => void copyToClipboard(value)}>Copy</button>
      <span>{isCopied ? 'Copied' : 'Not copied'}</span>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

test('clipboard refuses empty content and reports unavailable browser access', async () => {
  const write = spyOn(navigator.clipboard, 'writeText').mockResolvedValue(
    undefined,
  )
  const { container, rerender } = await render(<CopyControl value="" />)
  try {
    await click(container.querySelector('button')!)
    expect(container.textContent).toContain('There is no content to copy')
    expect(write).not.toHaveBeenCalled()
    const clipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    try {
      await rerender(<CopyControl value="Source" />)
      await click(container.querySelector('button')!)
      expect(container.textContent).toContain('Clipboard access is unavailable')
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        value: clipboard,
        configurable: true,
      })
    }
  } finally {
    write.mockRestore()
  }
})

test('clipboard success expires and rejection stays handled for existing callers without an error callback', async () => {
  const write = spyOn(navigator.clipboard, 'writeText').mockResolvedValue(
    undefined,
  )
  try {
    const { container, rerender } = await render(
      <CopyControl value="Source" report={false} />,
    )
    await click(container.querySelector('button')!)
    await waitFor(
      () => container.querySelector('span')?.textContent === 'Copied',
    )
    await waitFor(
      () => container.querySelector('span')?.textContent === 'Not copied',
    )
    write.mockRejectedValue(new Error('Denied'))
    await click(container.querySelector('button')!)
    expect(container.querySelector('span')?.textContent).toBe('Not copied')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await rerender(<CopyControl value="" report={false} />)
    await click(container.querySelector('button')!)
    expect(container.querySelector('span')?.textContent).toBe('Not copied')
  } finally {
    write.mockRestore()
  }
})
