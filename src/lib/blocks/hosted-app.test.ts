import { afterEach, describe, expect, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import type { FrameConnection } from './executor'
import { followTheme, hostedAppDocument } from './hosted-app'
import { rpcOver, serve } from './sandbox/protocol'
import type { SandboxMethods } from './sandbox/protocol'
import { applyTheme } from './sandbox/theme'
import type { AppTheme } from './sandbox/theme'

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

const STONE: AppTheme = {
  scheme: 'light',
  tokens: {
    ink: '#32302e',
    surface: '#c2bebb',
    hover: '#bbb7b3',
    border: '#9d9995',
    'border-control': '#514e4b',
    radius: '6px',
  },
}

test('the host stylesheet comes before every piece of the App’s own content', async () => {
  const html = await hostedAppDocument(
    `<html><head><meta charset="utf-8"><style>button { background: #fafaf9 }</style></head>
    <body><button>Next step</button><style>p { color: red }</style></body></html>`,
    esbuild,
    { theme: STONE },
  )
  const page = new DOMParser().parseFromString(html, 'text/html')
  const host = page.querySelector('style[data-theorem-theme]')!
  expect(host.previousElementSibling?.getAttribute('http-equiv')).toBe(
    'Content-Security-Policy',
  )
  expect(host.textContent).toContain('--theorem-ink: #32302e;')
  expect(host.textContent).toContain('color-scheme: light;')
  const authored = page.querySelectorAll(
    'meta[charset], style:not([data-theorem-theme]), button',
  )
  expect(authored).toHaveLength(4)
  for (const node of authored)
    expect(
      host.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  // The App's own stylesheet is left exactly as it wrote it.
  expect(
    page.querySelector('head style:not([data-theorem-theme])')?.textContent,
  ).toBe('button { background: #fafaf9 }')
})

describe('in a live document', () => {
  afterEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-palette')
  })

  function style(css: string, at: 'start' | 'end' = 'end') {
    const element = document.createElement('style')
    element.textContent = css
    if (at === 'start') document.head.prepend(element)
    else document.head.append(element)
  }

  test('plain elements take the theme and the App’s own rules win over it, wherever they stand', () => {
    style('button.own { background-color: #fafaf9; border-radius: 0 }')
    applyTheme(STONE)
    style('body { color: #292524 }')
    document.body.innerHTML =
      '<button class="plain">Plain</button><button class="own">Own</button><input>'
    const plain = getComputedStyle(document.querySelector('.plain')!)
    expect(plain.backgroundColor).toBe('transparent')
    expect(plain.borderTopColor).toBe('#9d9995')
    expect(plain.borderTopLeftRadius).toBe('6px')
    expect(
      getComputedStyle(document.querySelector('input')!).borderTopColor,
    ).toBe('#514e4b')
    // An earlier rule wins too: every host default has zero specificity.
    const own = getComputedStyle(document.querySelector('.own')!)
    expect(own.backgroundColor).toBe('#fafaf9')
    expect(own.borderTopLeftRadius).toBe('0px')
    expect(getComputedStyle(document.body).color).toBe('#292524')
  })

  test('the frame’s variables follow the page’s palette and mode', async () => {
    style(`:root { --ink: #24292d; --line-separator: #e1e4e8 }
      [data-palette='stone'] { --ink: #32302e; --line-separator: #9d9995 }
      .dark[data-palette='stone'] { --ink: #dedad6 }`)
    const frame = new DOMParser().parseFromString(
      await hostedAppDocument('<p>App</p>', esbuild),
      'text/html',
    )
    const variables = () =>
      frame.querySelector('style[data-theorem-theme]')?.textContent ?? ''
    expect(variables()).toContain('--theorem-ink: #24292d;')

    const channel = new MessageChannel()
    serve<SandboxMethods, 'theme.changed'>(
      rpcOver(channel.port2),
      'theme.changed',
      (theme) => {
        applyTheme(theme, frame)
        return null
      },
    )
    const connection = {
      connected: Promise.resolve(rpcOver(channel.port1)),
    } as unknown as FrameConnection
    const stop = followTheme(connection)
    try {
      document.documentElement.setAttribute('data-palette', 'stone')
      await until(() => variables().includes('--theorem-ink: #32302e;'))
      expect(variables()).toContain('--theorem-border: #9d9995;')
      expect(variables()).toContain('color-scheme: light;')

      document.documentElement.classList.add('dark')
      await until(() => variables().includes('--theorem-ink: #dedad6;'))
      expect(variables()).toContain('color-scheme: dark;')
      expect(frame.querySelectorAll('style[data-theorem-theme]')).toHaveLength(
        1,
      )
    } finally {
      stop()
      channel.port1.close()
    }
  })
})

async function until(condition: () => boolean) {
  for (let tries = 0; !condition(); tries++) {
    if (tries > 100) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
