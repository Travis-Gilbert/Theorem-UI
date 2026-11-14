// SOURCING: @theoremharness/sdk stringifyJson (lossless-json: prints the bigints the SDK parses wire integers above 2^53 into, which JSON.stringify refuses)
//
// How message parts the phone has no dedicated view for are named and printed.
import { stringifyJson } from '@theoremharness/sdk'

/** A data part's name in words: `theorem-response_style` reads "Response style". */
export function partTitle(name: string): string {
  const words = name.replace(/^theorem-/, '').replace(/[_-]+/g, ' ').trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Details'
}

/** A part's value as text for a disclosure. Never throws on a bigint. */
export function showValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  return (stringifyJson(value, undefined, 2) as string | undefined) ?? ''
}
