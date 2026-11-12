// SOURCING: expo requireOptionalNativeModule (Expo Modules API); the functions and events TheoCaptureModule.swift defines
//
// The screen-sharing prototype, optional at runtime: a build without the
// module, or another platform, says so instead of failing to import.
import { requireOptionalNativeModule } from 'expo'

export type CaptureStateName = 'idle' | 'picking' | 'capturing' | 'stopped' | 'failed'

export type StateEvent = { state: CaptureStateName; reason: string; microphone: boolean }
export type FrameEvent = { sequence: number; uri: string; width: number; height: number; capturedAtMs: number }
export type CaptureStats = { frames: number; microphoneBuffers: number; lastFrameAtMs: number }
export type CaptureSupport = { route: 'screencapturekit' | 'none'; reason: string }

type Subscription = { remove(): void }

type NativeCapture = {
  support(): CaptureSupport
  start(askForMicrophone: boolean): Promise<void>
  stop(): Promise<void>
  stats(): CaptureStats
  speak(text: string): Promise<void>
  addListener(event: 'onState', listener: (event: StateEvent) => void): Subscription
  addListener(event: 'onFrame', listener: (event: FrameEvent) => void): Subscription
}

const native = requireOptionalNativeModule<NativeCapture>('TheoCapture')

export const NO_CAPTURE_MODULE = 'This build does not include the screen-sharing prototype.'

export function captureSupport(): CaptureSupport {
  return native ? native.support() : { route: 'none', reason: NO_CAPTURE_MODULE }
}

/** The native capture module, or undefined where there is none. */
export const capture = (): NativeCapture | undefined => native ?? undefined
