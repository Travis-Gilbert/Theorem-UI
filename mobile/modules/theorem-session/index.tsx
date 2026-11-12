// SOURCING: expo requireOptionalNativeModule and requireNativeView (Expo Modules API); the AsyncFunctions and view TheoremSessionModule.swift defines
//
// The native feature is optional at runtime: Expo Go, a build without the
// pinned GhosttyKit, or another platform has no TheoremSession module, and
// the app says so instead of failing to import.
//
// Headless by default: computers saved on this device, and scripts run on them
// over Remux's SSH connection pool. The terminal view exists only for the
// person who turned on Show terminal in Settings.
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type ScenePhase = 'active' | 'inactive' | 'background' | 'unknown'

export type Computer = {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth: 'none' | 'password' | 'privateKey' | (string & {})
}

export type HostKeyChallenge = {
  /** `unknown`: first connection. `changed`: the computer now presents a different key. */
  kind: 'unknown' | 'changed'
  host: string
  keyType: string
  fingerprint: string
}

export type RunOutcome =
  | { kind: 'done'; exitStatus: number; stdout: string; stderr: string }
  | { kind: 'host-key'; challenge: HostKeyChallenge }

/** Passed to native once and stored in the Keychain there. It is never returned. */
export type ComputerCredential =
  | { kind: 'password'; password: string }
  | { kind: 'privateKey'; privateKey: string; passphrase?: string }

export type ComputerInput = {
  id: string
  name: string
  host: string
  port: number
  username: string
  credential: ComputerCredential
}

type NativeSession = {
  remuxRevision: string
  ghosttyKitRelease: string
  ghosttyBuildMode: string
  unavailableReason: string
  listComputers(): Promise<Computer[]>
  saveComputer(input: ComputerInput): Promise<RunOutcome>
  removeComputer(id: string): Promise<void>
  run(id: string, script: string): Promise<RunOutcome>
  trustHostKey(id: string, fingerprint: string): Promise<void>
}

const native = requireOptionalNativeModule<NativeSession>('TheoremSession')

export const NO_NATIVE_MODULE =
  'This build does not include the native session feature. It needs a development or release build made with the pinned GhosttyKit (modules/theorem-session/scripts/fetch-ghosttykit.sh).'

export type SessionSupport =
  | { available: true; remuxRevision: string; ghosttyKitRelease: string; ghosttyBuildMode: string }
  | { available: false; reason: string }

/** Whether this build can show a terminal. Headless commands need only `computers()`. */
export function sessionSupport(): SessionSupport {
  if (!native) return { available: false, reason: NO_NATIVE_MODULE }
  if (native.unavailableReason) return { available: false, reason: native.unavailableReason }
  return {
    available: true,
    remuxRevision: native.remuxRevision,
    ghosttyKitRelease: native.ghosttyKitRelease,
    ghosttyBuildMode: native.ghosttyBuildMode,
  }
}

export type Computers = {
  list(): Promise<Computer[]>
  /** Checks the sign-in first. A host key waiting for a decision comes back instead of a saved computer. */
  save(input: ComputerInput): Promise<RunOutcome>
  /** Removes the computer, its host key and its sign-in. Sessions on it keep running. */
  remove(id: string): Promise<void>
  /** Runs a `/bin/sh` script on the computer; the script goes on stdin. */
  run(id: string, script: string): Promise<RunOutcome>
  /** Trusts the key the person was shown. Fails if the key changed since. */
  trustHostKey(id: string, fingerprint: string): Promise<void>
}

/** The saved computers on this device, or undefined in a build without the native module. */
export function computers(): Computers | undefined {
  const module = native
  if (!module) return undefined
  return {
    list: () => module.listComputers(),
    save: (input) => module.saveComputer(input),
    remove: (id) => module.removeComputer(id),
    run: (id, script) => module.run(id, script),
    trustHostKey: (id, fingerprint) => module.trustHostKey(id, fingerprint),
  }
}

export type TheoremTerminalViewProps = ViewProps & {
  computerId: string
  /** The tmux session to open. */
  session: string
  /** The hosting window's scene changed; Remux pauses and resumes its surfaces on this. */
  onSceneChange?: (event: { nativeEvent: { phase: ScenePhase } }) => void
}

let view: ComponentType<TheoremTerminalViewProps> | undefined

/** The terminal for one tmux session. Only render when sessionSupport().available is true. */
export function TheoremTerminalView(props: TheoremTerminalViewProps) {
  view ??= requireNativeView<TheoremTerminalViewProps>('TheoremSession')
  const NativeView = view
  return <NativeView {...props} />
}
