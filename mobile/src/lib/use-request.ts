// SOURCING: React state; a small loader so screens show loading, failure and retry honestly
import { useCallback, useEffect, useRef, useState } from 'react'

export type Request<T> =
  | { status: 'loading'; data?: T; reload: () => void }
  | { status: 'ready'; data: T; reload: () => void }
  | { status: 'failed'; error: unknown; data?: T; reload: () => void }

export function useRequest<T>(load: () => Promise<T>, deps: readonly unknown[]): Request<T> {
  const [state, setState] = useState<Omit<Request<T>, 'reload'>>({ status: 'loading' })
  const generation = useRef(0)
  const run = useCallback(() => {
    const current = ++generation.current
    setState((previous) => ({ status: 'loading', data: previous.data }))
    load().then(
      (data) => current === generation.current && setState({ status: 'ready', data }),
      (error: unknown) =>
        current === generation.current &&
        setState((previous) => ({ status: 'failed', error, data: previous.data })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(run, [run])
  return { ...state, reload: run } as Request<T>
}
