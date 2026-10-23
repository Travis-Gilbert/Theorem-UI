// SOURCING: the modules beside it; the entry script of a cell's sandbox
// document, which the block listener serves at /__runtime/cell-runtime.
import { CellContext } from './cell'
import type { CellModule } from './cell'
import { connectToPage } from './connect'
import { createDisplay, observeHeight, observeSnapshots } from './display'
import { call, rpcOver, serve } from './protocol'
import type { PageMethods, SandboxMethods } from './protocol'

async function main(): Promise<void> {
  const url = document.querySelector<HTMLMetaElement>(
    'meta[name="theorem:cell"]',
  )?.content
  const root = document.getElementById('root')
  if (!url || !root) throw new Error('Not a cell document')
  // Start loading the cell while the page connects.
  const loaded = import(/* @vite-ignore */ url) as Promise<CellModule>
  const rpc = rpcOver(await connectToPage())
  const context = new CellContext(rpc, createDisplay(root))
  serve<SandboxMethods, 'cell.run'>(rpc, 'cell.run', async ({ inputs }) =>
    context.run(await loaded, inputs),
  )
  serve<SandboxMethods, 'state.changed'>(
    rpc,
    'state.changed',
    async ({ name, value }) => {
      await context.changed(name, value)
      return null
    },
  )
  observeHeight((height) => {
    void call<PageMethods, 'frame.resize'>(rpc, 'frame.resize', { height })
  })
  observeSnapshots((html) => {
    void call<PageMethods, 'frame.snapshot'>(rpc, 'frame.snapshot', { html })
  })
}

void main()
