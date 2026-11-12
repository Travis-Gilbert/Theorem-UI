// SOURCING: hand-roll — a failed write's one-line notice inside the component that made it (the app mounts no global toast outside the thread, and two tracker components on a page must not each raise the same one)
import { createContext, useCallback, useEffect, useState } from 'react'
import { Icon } from '@/components/icons'
import { describeError } from '@/lib/theorem/client'

/** Where a quick edit inside this subtree reports a refusal; the nearest list, board or detail provides it. */
export const EditErrorContext = createContext<(error: unknown) => void>(
  () => {},
)

/** A notice for a failed write; it clears itself, or when closed. */
export function useNotice() {
  const [notice, setNotice] = useState<string>()
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 8_000)
    return () => clearTimeout(timer)
  }, [notice])
  const say = useCallback(
    (error: unknown) => setNotice(describeError(error)),
    [],
  )
  const clear = useCallback(() => setNotice(undefined), [])
  return { notice, say, clear }
}

export function Notice({
  notice,
  onClear,
}: {
  notice: string | undefined
  onClear: () => void
}) {
  if (!notice) return null
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-separator bg-error-container px-3 py-1.5 text-sm text-error-ink"
    >
      <span className="min-w-0 flex-1">{notice}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClear}
        className="rounded p-0.5 hover:bg-hover"
      >
        <Icon.Close className="size-3.5" />
      </button>
    </div>
  )
}
