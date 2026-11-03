// The command table: every `invoke(command)` the OpenIDEA frontend makes that this host answers.
// A command not listed here is refused as `unavailable` by the host and counted (see
// `BrowserHost.refused`), so the gap shows up in the UI and in the evidence instead of hanging.

import type { CommandHandler } from '../host'
import { appCommands, type AppOptions } from './app'
import type { CommandContext } from './context'
import { DocumentRegistry, documentCommands } from './doc'
import { WorkspaceFiles, fsCommands } from './fs'
import { WorkspaceSearch, searchCommands } from './search'
import { SettingsLayers, settingsCommands } from './settings'
import { Terminals, terminalCommands } from './terminal'

export interface Commands {
  table: ReadonlyMap<string, CommandHandler>
  registry: DocumentRegistry
  files: WorkspaceFiles
  search: WorkspaceSearch
  terminals: Terminals
}

export function buildCommands(context: CommandContext, options: AppOptions): Commands {
  const settings = new SettingsLayers(context)
  const registry = new DocumentRegistry(context)
  const files = new WorkspaceFiles(context, (path) => registry.text(path))
  const search = new WorkspaceSearch(context, (path) => registry.text(path))
  const terminals = new Terminals(context)
  const table = new Map<string, CommandHandler>()
  for (const group of [
    appCommands(context, settings, options),
    settingsCommands(settings),
    documentCommands(registry),
    fsCommands(files),
    searchCommands(search),
    terminalCommands(terminals),
  ]) {
    for (const [name, handler] of Object.entries(group)) {
      if (table.has(name)) throw new Error(`command ${name} is answered twice`)
      table.set(name, handler)
    }
  }
  return { table, registry, files, search, terminals }
}
