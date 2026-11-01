// SOURCING: OpenIDEA's own `validateSettings` / `DEFAULT_SETTINGS` / `putAt` (the frontend's
// settings schema) shape and edit the values; the browser's `localStorage` holds the two layers
// the desktop backend keeps in TOML files (global, and per project). A browser tab has no
// config directory, so these layers live per browser profile, not in the workspace.

import { DEFAULT_SETTINGS, putAt, validateSettings } from '@/features/settings/model/schema'
import { failure, unavailable } from '../host'
import { arg, isString, type CommandContext, type CommandTable } from './context'

type Layer = Record<string, unknown>

const globalKey = 'theorem-ide-cm.settings.global'
const projectKey = (workspaceId: string) => `theorem-ide-cm.settings.project.${workspaceId}`

const isObject = (value: unknown): value is Layer =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Both layers, deep-merged: a project value replaces the global one key by key. */
function merge(base: Layer, over: Layer): Layer {
  const out: Layer = { ...base }
  for (const [key, value] of Object.entries(over)) {
    out[key] = isObject(value) && isObject(out[key]) ? merge(out[key] as Layer, value) : value
  }
  return out
}

export class SettingsLayers {
  /** Used when storage is unavailable (private window, blocked site data): settings last for the page. */
  private readonly memory = new Map<string, Layer>()

  constructor(private readonly context: CommandContext) {}

  private read(key: string): Layer {
    const held = this.memory.get(key)
    if (held) return held
    try {
      const raw = this.context.storage.getItem(key)
      const parsed: unknown = raw ? JSON.parse(raw) : {}
      return isObject(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private write(key: string, layer: Layer): void {
    this.memory.set(key, layer)
    try {
      this.context.storage.setItem(key, JSON.stringify(layer))
    } catch {
      /* the page keeps the value; a reload starts from the stored layers */
    }
  }

  /** Defaults plus the global layer: what a project without its own value gets. */
  global(): unknown {
    return validateSettings(this.read(globalKey))
  }

  /** The project's effective settings. */
  effective(): unknown {
    return validateSettings(merge(this.read(globalKey), this.read(projectKey(this.context.connection.workspaceId))))
  }

  set(scope: string, key: string, json: string): unknown {
    if (scope !== 'global' && scope !== 'project') throw failure('invalidInput', `unknown settings scope "${scope}"`)
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw failure('invalidInput', `the value for ${key} is not JSON`)
    }
    // A key the schema does not have would be silently dropped by validation; say so instead.
    if (!key.split('.').every(Boolean) || !(key.split('.')[0]! in DEFAULT_SETTINGS)) {
      throw failure('invalidInput', `${key} is not a setting`)
    }
    const layerKey = scope === 'global' ? globalKey : projectKey(this.context.connection.workspaceId)
    this.write(layerKey, putAt(this.read(layerKey), key, value))
    this.context.emit({ type: 'settingsChanged', key })
    return this.effective()
  }
}

export function settingsCommands(layers: SettingsLayers): CommandTable {
  return {
    settings_get: async () => layers.effective(),
    settings_get_global: async () => layers.global(),
    settings_set: async (args) =>
      layers.set(arg(args, 'scope', isString), arg(args, 'key', isString), arg(args, 'value', isString)),
    settings_export: () => {
      throw unavailable('Exporting settings', 'a browser tab cannot write to a local path; settings stay in this browser profile')
    },
    settings_import: () => {
      throw unavailable('Importing settings', 'a browser tab cannot read a local path')
    },
  }
}
