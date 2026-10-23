// SOURCING: the modules beside it; the script the block listener adds to an
// HTML app's pages (served at /__runtime/app-bridge). It gives the app
// `window.theorem`: the same declared files, state and run calls a cell has.
import { CellContext } from './cell'
import { connectToPage } from './connect'
import { observeHeight, observeSnapshots } from './display'
import { call, rpcOver, serve } from './protocol'
import type { PageMethods, SandboxMethods } from './protocol'

const context = connectToPage().then((port) => {
  const rpc = rpcOver(port)
  const cells = new CellContext(rpc, { show: () => {}, clear: () => {} })
  serve<SandboxMethods, 'state.changed'>(
    rpc,
    'state.changed',
    async ({ name, value }) => {
      await cells.changed(name, value)
      return null
    },
  )
  observeHeight((height) => {
    void call<PageMethods, 'frame.resize'>(rpc, 'frame.resize', { height })
  })
  observeSnapshots((html) => {
    void call<PageMethods, 'frame.snapshot'>(rpc, 'frame.snapshot', { html })
  })
  return cells
})

type Files = ReturnType<CellContext['files']>
const files = (name: keyof Files) =>
  async (...args: Array<string>) =>
    ((await context).files()[name] as (...a: Array<string>) => unknown)(
      ...args,
    )

const theorem = {
  /** Resolves once the page has connected this app. */
  ready: context.then(() => undefined),
  files: {
    text: files('text'),
    json: files('json'),
    csv: files('csv'),
    bytes: files('bytes'),
    list: files('list'),
    write: files('write'),
  },
  state: async (name: string) => (await context).state(name),
  run: async (target: string) =>
    call<PageMethods, 'run.request'>((await context).rpc, 'run.request', {
      target,
    }),
}

Object.defineProperty(window, 'theorem', { value: theorem })
