// SOURCING: expo requireOptionalNativeModule and requireNativeView (Expo Modules API)
//
// The native feature is optional at runtime: Expo Go, a build without the
// pinned GhosttyKit, or another platform has no TheoremSession module, and
// the app says so instead of failing to import.
import type { ComponentType } from 'react'
import type { ViewProps } from 'react-native'
import { requireNativeView, requireOptionalNativeModule } from 'expo'

export type ScenePhase = 'active' | 'inactive' | 'background' | 'unknown'

export type TheoremSessionViewProps = ViewProps & {
  /** The hosting window's scene changed; Remux pauses and resumes its surfaces on this. */
  onSceneChange?: (event: { nativeEvent: { phase: ScenePhase } }) => void
}

type NativeSession = {
  remuxRevision: string
  ghosttyKitRelease: string
  ghosttyBuildMode: string
  unavailableReason: string
}

const native = requireOptionalNativeModule<NativeSession>('TheoremSession')

export type SessionSupport =
  | { available: true; remuxRevision: string; ghosttyKitRelease: string; ghosttyBuildMode: string }
  | { available: false; reason: string }

export function sessionSupport(): SessionSupport {
  if (!native)
    return {
      available: false,
      reason:
        'This build does not include the native session feature. It needs a development or release build made with the pinned GhosttyKit (modules/theorem-session/scripts/fetch-ghosttykit.sh).',
    }
  if (native.unavailableReason) return { available: false, reason: native.unavailableReason }
  return {
    available: true,
    remuxRevision: native.remuxRevision,
    ghosttyKitRelease: native.ghosttyKitRelease,
    ghosttyBuildMode: native.ghosttyBuildMode,
  }
}

let view: ComponentType<TheoremSessionViewProps> | undefined

/** The native view; only call when sessionSupport().available is true. */
export function TheoremSessionView(props: TheoremSessionViewProps) {
  view ??= requireNativeView<TheoremSessionViewProps>('TheoremSession')
  const NativeView = view
  return <NativeView {...props} />
}
