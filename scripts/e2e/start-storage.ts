// The server's request storage, as a browser sees it: there is none. The
// app's own build leaves this module out of the client; this page is served
// without that build, so it stands in.
export function runWithStartContext<TValue>(
  _context: unknown,
  run: () => TValue,
): TValue {
  return run()
}

export function getStartContext(options?: { throwIfNotFound?: boolean }) {
  if (options?.throwIfNotFound !== false)
    throw new Error('No Start context in a browser')
  return undefined
}
