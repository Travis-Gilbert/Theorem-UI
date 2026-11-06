// SOURCING: @puckeditor/core 0.24's createUsePuck (the selected instance and
// the page being arranged) and its setData action, ui/dialog over Base UI
// Dialog, layout.ts's extractComposite. Saves what is selected, with what it
// contains, as a module of its own, and puts one instance of it in its place.
import { createUsePuck } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MODULE_SCHEMA } from '@/lib/modules/contract'
import type { LayoutData, ModuleManifest } from '@/lib/modules/contract'
import {
  MISSING_TYPE,
  extractComposite,
  prepareLayout,
  restoreLayout,
} from '@/lib/modules/layout'
import {
  allModules,
  fromManifest,
  moduleById,
  setInstalled,
  useModuleCatalog,
} from '@/lib/modules/registry'
import { newModuleId, useCreateModule } from '@/lib/modules/store'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { LAYOUT_TYPES } from './puck-config'

const usePuck = createUsePuck()

export function SaveAsModule({ client }: { client: WorkspaceClient }) {
  const selected = usePuck((s) => s.selectedItem)
  const [open, setOpen] = useState(false)
  if (!selected || selected.type === MISSING_TYPE) return null
  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
        Save as module
      </Button>
      {open && (
        <SaveDialog
          client={client}
          rootId={selected.props.id as string}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function SaveDialog({
  client,
  rootId,
  onClose,
}: {
  client: WorkspaceClient
  rootId: string
  onClose: () => void
}) {
  const data = usePuck((s) => s.appState.data) as unknown as LayoutData
  const dispatch = usePuck((s) => s.dispatch)
  const catalog = useModuleCatalog()
  const lookup = useMemo(
    () => (type: string) => moduleById(type, catalog),
    [catalog],
  )
  const create = useCreateModule(client)
  const [label, setLabel] = useState('')
  const id = newModuleId(
    label || 'module',
    new Set(allModules(catalog).map((m) => m.id)),
  )
  // What the module would take, give and send, as the page wires it now.
  const preview = useMemo(
    () => extractComposite(restoreLayout(data), rootId, id, lookup),
    [data, rootId, id, lookup],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = label.trim()
    if (!name || !preview) return
    const manifest: ModuleManifest = {
      schema: MODULE_SCHEMA,
      id,
      version: 1,
      label: name,
      settings: [],
      inputs: preview.inputs,
      outputs: preview.outputs,
      events: preview.events,
      actions: [],
      capabilities: { read: [], write: [], state: [], net: [] },
      migrations: [],
      implementation: {
        kind: 'composite',
        content: preview.content,
        exposes: preview.exposes,
      },
    }
    const saved = await create.mutateAsync({ label: name, id, manifest })
    // In the catalog at once; the vault's own read replaces it shortly.
    const { installed, problems } = useModuleCatalog.getState()
    setInstalled([...installed, fromManifest(manifest, saved.path)], problems)
    const next = prepareLayout(
      preview.layout,
      (type) => moduleById(type),
      (type) => LAYOUT_TYPES.has(type),
    )
    dispatch({ type: 'setData', data: next as unknown as Partial<Data> })
    onClose()
  }

  const line = (title: string, names: string[]) =>
    names.length ? (
      <p>
        <span className="text-ink">{title}</span> {names.join(', ')}
      </p>
    ) : null

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              Save as module
            </DialogTitle>
            <DialogDescription>
              What is selected, and what it holds, becomes one module you can
              place on any page. This page keeps working as it does now.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Module name"
            placeholder="Module name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {preview && (
            <div className="flex flex-col gap-1 text-xs text-ink-muted">
              {line(
                'Takes',
                preview.inputs.map((p) => p.label),
              )}
              {line(
                'Gives',
                preview.outputs.map((p) => p.label),
              )}
              {line(
                'Sends',
                preview.events.map((p) => p.label),
              )}
              {!preview.inputs.length &&
                !preview.outputs.length &&
                !preview.events.length && (
                  <p>
                    Nothing outside it is connected to it, so it takes and gives
                    nothing.
                  </p>
                )}
              <p className="font-mono">{id}</p>
            </div>
          )}
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!label.trim() || !preview || create.isPending}
            >
              {create.isPending ? 'Saving…' : 'Save module'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
