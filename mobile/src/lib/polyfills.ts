// SOURCING: expo-crypto (randomUUID, getRandomValues), @bacons/text-decoder (TextDecoder where Hermes lacks it); Expo's winter runtime already installs streaming fetch, URL, structuredClone, TextDecoderStream and Symbol.asyncIterator
//
// The Theorem SDK assumes a WinterCG-style runtime. Import this module first,
// before anything that reaches the SDK, then call assertRuntime() so a missing
// global fails at launch instead of in the middle of a send.
import '@bacons/text-decoder/install'
import { getRandomValues, randomUUID } from 'expo-crypto'

type CryptoLike = {
  randomUUID?: () => string
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T
}

const scope = globalThis as unknown as { crypto?: CryptoLike }
scope.crypto ??= {}
// Command ids are idempotency keys: they must come from a CSPRNG.
scope.crypto.randomUUID ??= randomUUID
scope.crypto.getRandomValues ??= getRandomValues as CryptoLike['getRandomValues']

/** What the SDK and its streaming transport reach for at runtime. */
export const REQUIRED_GLOBALS = [
  'fetch',
  'Headers',
  'AbortController',
  'ReadableStream',
  'TextDecoder',
  'TextEncoder',
  'URL',
  'URLSearchParams',
  'structuredClone',
] as const

export function missingGlobals(scope: object = globalThis): string[] {
  const missing: string[] = REQUIRED_GLOBALS.filter(
    (name) => typeof (scope as Record<string, unknown>)[name] === 'undefined',
  )
  const crypto = (scope as { crypto?: CryptoLike }).crypto
  if (typeof crypto?.randomUUID !== 'function') missing.push('crypto.randomUUID')
  if (typeof (Symbol as { asyncIterator?: symbol }).asyncIterator !== 'symbol')
    missing.push('Symbol.asyncIterator')
  return missing
}

export function assertRuntime(): void {
  const missing = missingGlobals()
  if (missing.length)
    throw new Error(`This build is missing runtime features Theorem needs: ${missing.join(', ')}.`)
}
