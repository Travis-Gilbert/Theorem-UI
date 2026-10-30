import { expect, test } from 'bun:test'

let upstream: () => Response
const requested: Array<string> = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requested.push(String(input instanceof Request ? input.url : input))
  return upstream()
}) as typeof fetch

const { LATEST_INSTALLER_URL, serveInstaller } =
  await import('./theorem-installer')

test('serves the latest mirrored installer as readable text', async () => {
  upstream = () => new Response('#!/bin/sh\necho theorem\n')
  const response = await serveInstaller()
  expect(requested.at(-1)).toBe(LATEST_INSTALLER_URL)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(await response.text()).toBe('#!/bin/sh\necho theorem\n')
})

test('fails loudly when no release is published, so sh receives nothing', async () => {
  upstream = () => new Response('Not Found', { status: 404 })
  const response = await serveInstaller()
  expect(response.status).toBe(502)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).toContain('answered 404')
})
