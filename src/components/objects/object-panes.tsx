// SOURCING: dockview-react's panel and tab props (the Notes workspace's panes, notes-workspace.tsx), one pane component per PaneSpec kind (notes-workspace-state.ts) over the object surfaces in this folder; the tab is the note tab's pill grammar with the class's own icon from the register
import type {
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react'
import { useEffect } from 'react'
import { Icon } from '@/components/icons'
import {
  parseRecordItemId,
  objectTypeByName,
  recordTitle,
} from '@/components/records/model'
import { useRecord } from '@/components/records/queries'
import { APP_KIND } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import type { ClassRegistry, ObjectClass } from '@/lib/objects/classes'
import { useCollections } from '@/lib/objects/collections'
import { artifactForm } from '@/lib/objects/library'
import { useClassRegistry } from '@/lib/objects/register'
import { useNotesWorkspace } from '@/components/notes/notes-workspace-state'
import type { PaneSpec } from '@/components/notes/notes-workspace-state'
import { ClassEditor } from './class-editor'
import { ClassIcon } from './class-icon'
import { ClassManager } from './class-manager'
import { ObjectGraph } from './object-graph'
import { useInspector } from './object-inspector'
import { ObjectLibrary } from './object-library'
import { ObjectPage } from './object-page'

/** The standard class a note belongs to: a Page, or the App or Notebook its saved form names. */
export function noteClass(
  registry: ClassRegistry,
  note: Pick<Note, 'documentKind' | 'canonical'> | undefined,
) {
  if (note?.documentKind === APP_KIND)
    return registry.formClass(artifactForm(note))
  return registry.native.page
}

type Label = {
  title: string
  cls?: Pick<ObjectClass, 'icon' | 'tone'>
  glyph?: 'graph' | 'settings'
}

const splitKey = (key: string): [string, string] => {
  const at = key.indexOf(':')
  return at < 0 ? [key, ''] : [key.slice(0, at), key.slice(at + 1)]
}

/** What a pane's tab says: its class and title, read from the register. */
function usePaneLabel(spec: PaneSpec): Label {
  const { registry, model } = useClassRegistry()
  const collections = useCollections(registry)
  const recordRef =
    spec.kind === 'record'
      ? spec.key
      : spec.kind === 'graph' && spec.key.startsWith('local:')
        ? spec.key.slice(6)
        : ''
  const parsed = recordRef ? parseRecordItemId(recordRef) : undefined
  const recordType = parsed
    ? objectTypeByName(model.data, parsed.nameSingular)
    : undefined
  const record = useRecord(recordType, parsed?.recordId ?? '')
  const recordName =
    recordType && record.data ? recordTitle(recordType, record.data) : undefined

  switch (spec.kind) {
    case 'library': {
      const [kind, id] = splitKey(spec.key)
      if (kind === 'class') {
        const cls = registry.byId.get(id)
        return { title: cls?.plural ?? 'Objects', cls }
      }
      if (kind === 'collection') {
        const found = collections.collections.find((c) => c.id === id)
        return { title: found?.name ?? 'Collection', cls: registry.collection }
      }
      return { title: 'All objects', cls: { icon: 'shapes', tone: 'neutral' } }
    }
    case 'record':
      return {
        title: recordName ?? recordType?.label_singular ?? 'Object',
        cls: recordType
          ? registry.byId.get(recordType.object_type_id)
          : undefined,
      }
    case 'graph': {
      const [kind, id] = splitKey(spec.key)
      if (kind === 'collection')
        return {
          title: `${collections.collections.find((c) => c.id === id)?.name ?? 'Collection'} graph`,
          glyph: 'graph',
        }
      if (kind === 'local')
        return {
          title: recordName ? `${recordName} graph` : 'Local graph',
          glyph: 'graph',
        }
      return { title: 'Graph', glyph: 'graph' }
    }
    case 'class': {
      const cls = spec.key === 'new' ? undefined : registry.byId.get(spec.key)
      return {
        title: cls ? `${cls.label} class` : 'New object class',
        cls: cls ?? { icon: 'box', tone: 'neutral' },
      }
    }
    case 'classes':
      return { title: 'Object classes', glyph: 'settings' }
    default:
      return { title: 'Note' }
  }
}

const specOf = (kind: PaneSpec['kind'], key: string) =>
  ({ kind, key }) as PaneSpec

type Props = IDockviewPanelProps<{ key: string }>

function useTitle(api: Props['api'], spec: PaneSpec) {
  const { title } = usePaneLabel(spec)
  useEffect(() => api.setTitle(title), [api, title])
}

function LibraryPane({ api, params }: Props) {
  useTitle(api, specOf('library', params.key))
  return <ObjectLibrary key={params.key} scope={params.key} />
}

function RecordPane({ api, params }: Props) {
  useTitle(api, specOf('record', params.key))
  return <ObjectPage objectRef={params.key} />
}

function GraphPane({ api, params }: Props) {
  useTitle(api, specOf('graph', params.key))
  return <ObjectGraph scope={params.key} />
}

function ClassPane({ api, params }: Props) {
  useTitle(api, specOf('class', params.key))
  return (
    <ClassEditor
      key={params.key}
      classKey={params.key}
      onCreated={(id) => {
        useNotesWorkspace.getState().open({ kind: 'class', key: id })
        api.close()
      }}
    />
  )
}

function ClassesPane({ api }: Props) {
  useTitle(api, specOf('classes', 'all'))
  return <ClassManager />
}

/** The pill at a non-note pane's top left: its class icon and title. */
function ObjectTab({
  api,
  params,
}: IDockviewPanelHeaderProps<{ key: string }>) {
  const kind = api.id.slice(0, api.id.indexOf(':')) as PaneSpec['kind']
  const label = usePaneLabel(specOf(kind, params.key))
  return (
    <div className="flex h-full min-w-0 items-center gap-1.5 ps-1.5 pe-2.5">
      {label.cls ? (
        <ClassIcon cls={label.cls} />
      ) : label.glyph === 'graph' ? (
        <Icon.Graph aria-hidden className="size-4 shrink-0 text-ink-faint" />
      ) : (
        <Icon.Settings aria-hidden className="size-4 shrink-0 text-ink-faint" />
      )}
      <span className="max-w-[16rem] min-w-0 truncate text-[13px] font-medium">
        {label.title}
      </span>
    </div>
  )
}

export const objectPanes = {
  library: LibraryPane,
  record: RecordPane,
  graph: GraphPane,
  class: ClassPane,
  classes: ClassesPane,
}

export const objectTabs = {
  library: ObjectTab,
  record: ObjectTab,
  graph: ObjectTab,
  class: ObjectTab,
  classes: ObjectTab,
}

/** The inspector's toggle, for a pane that shows an object. */
export function InspectorToggle() {
  const { open, toggle } = useInspector()
  return (
    <button
      type="button"
      aria-label={open ? 'Hide the inspector' : 'Show the inspector'}
      aria-pressed={open}
      onClick={toggle}
      className="flex size-6 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus aria-pressed:text-ink"
    >
      <Icon.Panels className="size-3.5" />
    </button>
  )
}

/** The phone's stand-in for a workspace pane that is not a note. */
export function PhonePane({ spec }: { spec: PaneSpec }) {
  switch (spec.kind) {
    case 'library':
      return <ObjectLibrary key={spec.key} scope={spec.key} />
    case 'record':
      return <ObjectPage objectRef={spec.key} />
    case 'graph':
      return <ObjectGraph scope={spec.key} />
    case 'class':
      return (
        <ClassEditor
          key={spec.key}
          classKey={spec.key}
          onCreated={(id) =>
            useNotesWorkspace.getState().open({ kind: 'class', key: id })
          }
        />
      )
    case 'classes':
      return <ClassManager />
    default:
      return null
  }
}
