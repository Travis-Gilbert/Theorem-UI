// What every command module is given: the workspace connection, the way to tell the frontend
// something happened (an `IdeEvent` on the `ide://event` bus), and per-page storage.

import type { CommandHandler } from '../host'
import type { WorkspaceConnection } from '../connection'

/** The `IdeEvent` variants the host emits; the frontend's generated type is the full union. */
export type EmittedEvent =
  | { type: 'docDirty'; doc: number; dirty: boolean }
  | { type: 'fsChanged'; created: string[]; modified: string[]; removed: string[] }
  | { type: 'settingsChanged'; key: string }
  | { type: 'notify'; level: 'info' | 'warning' | 'error'; title: string; body: string | null }
  | { type: 'projectRootsChanged'; root: string }
  | { type: 'terminalExited'; terminal: number; code: number | null }

export interface CommandContext {
  connection: WorkspaceConnection
  emit(event: EmittedEvent): void
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

export type CommandTable = Record<string, CommandHandler>
export type CommandModule = (context: CommandContext) => CommandTable

/** An argument the frontend passed, narrowed; a malformed call is an invalid-input failure. */
export function arg<T>(args: Record<string, unknown>, name: string, check: (v: unknown) => v is T): T {
  const value = args[name]
  if (!check(value)) throw { kind: 'invalidInput', message: `argument "${name}" is missing or has the wrong type` }
  return value
}

export const isString = (v: unknown): v is string => typeof v === 'string'
export const isNumber = (v: unknown): v is number => typeof v === 'number'
export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)
