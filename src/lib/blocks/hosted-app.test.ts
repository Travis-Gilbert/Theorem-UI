import { expect, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import { hostedAppDocument } from './hosted-app'

test('a hosted App carries the real bridge under a restrictive policy without a desktop listener', async () => {
  const input =
    '<!doctype html><html><head><title>Comparison</title></head><body><table><tr><td contenteditable>Category</td></tr></table><script>window.appLoaded = true</script></body></html>'
  const html = await hostedAppDocument(input, esbuild)
  const page = new DOMParser().parseFromString(html, 'text/html')
  const policy = page
    .querySelector('meta[http-equiv="Content-Security-Policy"]')
    ?.getAttribute('content')
  expect(policy).toContain("default-src 'none'")
  expect(policy).toContain("connect-src 'none'")
  expect(policy).toContain("form-action 'none'")
  expect(policy).toContain("base-uri 'none'")
  expect(page.querySelector('td')?.textContent).toBe('Category')
  expect(page.querySelector('td')?.hasAttribute('contenteditable')).toBe(true)
  const bridge = page.querySelector(
    'script[data-theorem-app-bridge]',
  )?.textContent
  expect(bridge).toContain('theorem')
  expect(bridge).toContain('theorem:block-ready')
  expect(html).not.toContain('/desktop/')
  expect(html).not.toContain('127.0.0.1')
}, 30_000)

test('only declared network hosts are allowed and a source policy cannot relax the host policy', async () => {
  const html = await hostedAppDocument(
    `<html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src *">
    <meta name="theorem:uses" content='net("example.com")'>
    </head><body>App</body></html>`,
    esbuild,
  )
  const page = new DOMParser().parseFromString(html, 'text/html')
  const policy = page.head.firstElementChild
  expect(policy?.getAttribute('http-equiv')).toBe('Content-Security-Policy')
  expect(policy?.getAttribute('content')).toContain(
    'connect-src https://example.com',
  )
  expect(policy?.getAttribute('content')).toContain("default-src 'none'")
})

test('a page module reaches only the hosts it was allowed, whatever its page declares', async () => {
  const html = await hostedAppDocument(
    `<html><head>
    <meta name="theorem:uses" content='net("example.com")'>
    </head><body>Module</body></html>`,
    esbuild,
    { net: [] },
  )
  const page = new DOMParser().parseFromString(html, 'text/html')
  expect(page.head.firstElementChild?.getAttribute('content')).toContain(
    "connect-src 'none'",
  )
})
