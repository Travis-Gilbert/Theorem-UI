// SOURCING: bun:test over why the navigator's Files section has no Home.
import { expect, test } from 'bun:test'
import { homeAbsence } from './folders'

test('Home offers sign-in only when Theorem says no one is signed in', () => {
  const base = { isPending: false, signIn: true }
  expect(homeAbsence({ ...base, signedOut: true })).toBe('signed-out')
  // Signed in, or a session that failed for another reason.
  expect(homeAbsence({ ...base, signedOut: false })).toBeNull()
  // The session or the folders are still loading.
  expect(homeAbsence({ ...base, isPending: true, signedOut: false })).toBe(
    'loading',
  )
  expect(homeAbsence({ ...base, signIn: false, signedOut: true })).toBeNull()
})
