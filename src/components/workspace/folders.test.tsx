// SOURCING: bun:test over why the navigator's Files section has no Home.
import { expect, test } from 'bun:test'
import { homeAbsence } from './folders'

test('Home offers sign-in only to someone signed out', () => {
  const base = { isPending: false, signIn: true }
  expect(homeAbsence({ ...base, tenant: undefined })).toBe('signed-out')
  expect(homeAbsence({ ...base, tenant: 'Travis-Gilbert' })).toBeNull()
  expect(homeAbsence({ ...base, isPending: true, tenant: undefined })).toBe(
    'loading',
  )
  expect(homeAbsence({ ...base, signIn: false, tenant: undefined })).toBeNull()
})
