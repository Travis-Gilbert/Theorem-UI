import { expect, test } from 'bun:test'
import { routeUrl } from './passthrough'

test('a route keeps its query: the SDK escapes a ? in a relative path', () => {
  expect(
    routeUrl(
      '/api/documents/v2/collections?schema=theorem-document/2',
      'http://localhost:3102',
    ),
  ).toBe(
    'http://localhost:3102/api/documents/v2/collections?schema=theorem-document/2',
  )
})

test('a route without a query is the same route on this origin', () => {
  expect(routeUrl('/api/chat/v1/models', 'https://theorem.rs')).toBe(
    'https://theorem.rs/api/chat/v1/models',
  )
})
