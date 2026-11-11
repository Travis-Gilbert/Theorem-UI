// SOURCING: zustand (the catalog is a store, so a module installed or edited
// in the vault reaches pages already open), as the file handler registry
// (src/lib/handlers/registry.ts) is. What a module is comes from ./contract.
import type { ComponentType } from 'react'
import { create } from 'zustand'
import type {
  ComponentData,
  MigrationStep,
  ModuleManifest,
  PortSpec,
  RequestedCapabilities,
  SettingSpec,
} from './contract'

/** What a built-in module's view receives. */
export interface ModuleViewProps {
  instanceId: string
  /** Where it sits: its id, inside the path of any composite around it. */
  path: string
  /** Settings, with a bound input of the same name taking its place. */
  settings: Record<string, unknown>
  /** Each input's current value, after its binding's pick and conversion. */
  inputs: Record<string, unknown>
  /** Publishes an output; an equal value is a no-op. */
  output: (name: string, value: unknown) => void
  /** Sends an event along this instance's routes. */
  emit: (name: string, payload: unknown) => void
  /** True while the page is being arranged rather than used. */
  arranging: boolean
}

export type ModuleImplementationRuntime =
  | { kind: 'builtin'; Component: ComponentType<ModuleViewProps> }
  | {
      kind: 'sandboxed-html'
      /** The vault folder the module's files sit in, `Modules/acme-notes`. */
      folder: string
      entry: string
    }
  | {
      kind: 'composite'
      content: Array<ComponentData>
      exposes: {
        outputs: Record<string, { instance: string; port: string }>
        events: Record<string, { instance: string; event: string }>
        actions: Record<string, { instance: string; action: string }>
      }
    }

/**
 * One module, wherever it came from: built into this app, installed as
 * files in the vault, or saved from a page as a composite.
 */
export interface ModuleDefinition {
  id: string
  version: number
  label: string
  description?: string
  origin: 'builtin' | 'vault'
  /** Where it is listed in the palette. */
  category: 'Theorem' | 'Work' | 'Layout' | 'Installed' | 'Composite'
  settings: Array<SettingSpec>
  inputs: Array<PortSpec>
  outputs: Array<PortSpec>
  events: Array<PortSpec>
  actions: Array<PortSpec>
  capabilities: RequestedCapabilities
  migrations: Array<MigrationStep>
  implementation: ModuleImplementationRuntime
  /** The vault file it was read from. */
  path?: string
}

const NONE: RequestedCapabilities = { read: [], write: [], state: [], net: [] }

/** A built-in's definition, its unset lists empty. */
export function builtin(
  definition: Pick<ModuleDefinition, 'id' | 'label'> &
    Partial<Omit<ModuleDefinition, 'implementation' | 'origin'>> & {
      Component: ComponentType<ModuleViewProps>
    },
): ModuleDefinition {
  const { Component, ...rest } = definition
  return {
    version: 1,
    category: 'Theorem',
    settings: [],
    inputs: [],
    outputs: [],
    events: [],
    actions: [],
    capabilities: NONE,
    migrations: [],
    ...rest,
    origin: 'builtin',
    implementation: { kind: 'builtin', Component },
  }
}

/** An installed module's definition, from its manifest at `path`. */
export function fromManifest(
  manifest: ModuleManifest,
  path: string,
): ModuleDefinition {
  const folder = path.slice(0, path.lastIndexOf('/'))
  const { implementation } = manifest
  return {
    id: manifest.id,
    version: manifest.version,
    label: manifest.label,
    description: manifest.description,
    origin: 'vault',
    category: implementation.kind === 'composite' ? 'Composite' : 'Installed',
    settings: manifest.settings,
    inputs: manifest.inputs,
    outputs: manifest.outputs,
    events: manifest.events,
    actions: manifest.actions,
    // A composite reaches only what its parts do; it asks for nothing itself.
    capabilities:
      implementation.kind === 'composite' ? NONE : manifest.capabilities,
    migrations: manifest.migrations,
    implementation:
      implementation.kind === 'composite'
        ? implementation
        : { kind: 'sandboxed-html', folder, entry: implementation.entry },
    path,
  }
}

interface Catalog {
  builtins: Array<ModuleDefinition>
  /** Read from the vault; replaced whole each time the Modules folder changes. */
  installed: Array<ModuleDefinition>
  /** Module files that did not parse, so the library can say why. */
  problems: Array<{ path: string; message: string }>
}

export const useModuleCatalog = create<Catalog>()(() => ({
  builtins: [],
  installed: [],
  problems: [],
}))

/** Adds a built-in, replacing one with the same id. Returns its removal. */
export function registerBuiltin(definition: ModuleDefinition): () => void {
  useModuleCatalog.setState(({ builtins }) => {
    const at = builtins.findIndex((m) => m.id === definition.id)
    return {
      builtins:
        at < 0 ? [...builtins, definition] : builtins.with(at, definition),
    }
  })
  return () =>
    useModuleCatalog.setState(({ builtins }) => ({
      builtins: builtins.filter((m) => m !== definition),
    }))
}

export function setInstalled(
  installed: Array<ModuleDefinition>,
  problems: Catalog['problems'] = [],
) {
  // A vault module may not shadow a built-in.
  const taken = new Set(useModuleCatalog.getState().builtins.map((m) => m.id))
  const seen = new Set<string>()
  const kept: Array<ModuleDefinition> = []
  const refused = [...problems]
  for (const definition of installed) {
    if (taken.has(definition.id) || seen.has(definition.id)) {
      refused.push({
        path: definition.path ?? definition.id,
        message: `another module already has the id ${definition.id}`,
      })
      continue
    }
    seen.add(definition.id)
    kept.push(definition)
  }
  useModuleCatalog.setState({ installed: kept, problems: refused })
}

export const allModules = (catalog: Catalog = useModuleCatalog.getState()) => [
  ...catalog.builtins,
  ...catalog.installed,
]

export const moduleById = (
  id: string,
  catalog: Catalog = useModuleCatalog.getState(),
) =>
  catalog.builtins.find((m) => m.id === id) ??
  catalog.installed.find((m) => m.id === id)
