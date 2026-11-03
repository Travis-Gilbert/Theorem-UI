// SOURCING: none — a two-value switch read from the page address and localStorage
//
// Which IDE the frame shows. Theia is the default and the only one with the
// Follow-the-Agent link and Add to chat; the CodeMirror client (ide-cm/) is
// opted into with `?ide=cm` on the app's address, and the choice is
// remembered. `?ide=theia` returns to the default.

export type IdeEngine = 'theia' | 'cm'

export const ENGINE_KEY = 'theorem-ui.ide-engine'

/** Where each engine's build is served, and so the frame's address. */
export const ENGINE_BASE: Record<IdeEngine, string> = {
  theia: '/theia/',
  cm: '/ide-cm/',
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const isEngine = (value: unknown): value is IdeEngine =>
  value === 'theia' || value === 'cm'

function remembered(storage: Store | undefined) {
  try {
    const kept = storage?.getItem(ENGINE_KEY)
    return isEngine(kept) ? kept : undefined
  } catch {
    return undefined
  }
}

/**
 * The address wins and is remembered; otherwise the remembered choice; otherwise
 * Theia. A storage that throws (a private window) only costs the memory.
 */
export function chooseIdeEngine(search: string, storage?: Store): IdeEngine {
  const asked = new URLSearchParams(search).get('ide')
  if (isEngine(asked)) {
    try {
      storage?.setItem(ENGINE_KEY, asked)
    } catch {
      // The choice holds for this page load.
    }
    return asked
  }
  return remembered(storage) ?? 'theia'
}
