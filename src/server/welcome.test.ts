// SOURCING: bun:test over the welcome route, with OpenRouter's reply stubbed at fetch
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { WelcomeContext } from '@/lib/theorem/welcome-schema'
import { welcome } from './welcome'

const context: WelcomeContext = {
  localTime: 'Friday, October 24 at 9:14 PM',
  project: 'Context engine live',
  threads: [
    {
      title: 'Cold-head context program',
      lastMessageAt: '2026-10-24T20:40:00.000Z',
      lastAsk: 'Why does the retry path drop the second batch?',
    },
  ],
  folders: [{ name: 'Notes', recentFiles: ['inbox.md'] }],
}

const post = (body: unknown) =>
  new Request('http://localhost/api/welcome', {
    method: 'POST',
    body: JSON.stringify(body),
  })

const answer = {
  headline: 'Back to the retry path?',
  suggestions: [
    {
      title: 'Pick up',
      label: 'the retry path',
      prompt: 'Where were we on the retry path?',
    },
    {
      title: 'Write up',
      label: 'the batching fix',
      prompt: 'Draft a note on the batching fix.',
    },
    { title: 'Extra', label: 'one too many', prompt: 'Not shown.' },
  ],
}

describe('welcome', () => {
  const saved = { ...process.env }
  const browserFetch = globalThis.fetch
  // The route runs on the server. With happy-dom's window in place the SDK
  // takes this for a browser and refuses to hold a key.
  const page = Object.getOwnPropertyDescriptor(globalThis, 'window')!
  let sent: Record<string, unknown> | undefined

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    })
    delete process.env.THEOREM_OAUTH_CLIENT_ID
    process.env.THEOREM_API_TOKEN = 'deployment-token'
    process.env.OPENROUTER_API_KEY = 'test-key'
    sent = undefined
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return Response.json({
        id: 'gen-1',
        object: 'chat.completion',
        created: 0,
        model: 'qwen/qwen3.8-omni-flash',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify(answer),
              refusal: null,
            },
          },
        ],
      })
    }) as typeof fetch
  })
  afterEach(() => {
    Object.defineProperty(globalThis, 'window', page)
    process.env = { ...saved }
    globalThis.fetch = browserFetch
  })

  test('asks Omni Flash for a structured welcome and keeps two suggestions', async () => {
    const response = await welcome(post(context))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.headline).toBe('Back to the retry path?')
    expect(body.suggestions.map((s: { title: string }) => s.title)).toEqual([
      'Pick up',
      'Write up',
    ])
    expect(sent?.model).toBe('qwen/qwen3.8-omni-flash')
    expect(sent?.response_format).toMatchObject({ type: 'json_schema' })
    expect(sent?.reasoning).toEqual({ effort: 'low', exclude: true })
    const messages = sent?.messages as Array<{ role: string; content: string }>
    expect(JSON.parse(messages[1]!.content)).toEqual(context)
  })

  test('answers 503 without an OpenRouter key, before calling anything', async () => {
    delete process.env.OPENROUTER_API_KEY
    const response = await welcome(post(context))
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('welcome_unconfigured')
    expect(sent).toBeUndefined()
  })

  test('refuses a malformed context', async () => {
    const response = await welcome(post({ threads: 'none' }))
    expect(response.status).toBe(400)
    expect(sent).toBeUndefined()
  })

  test('answers 502 when the model reply does not fit the schema', async () => {
    globalThis.fetch = (async () =>
      Response.json({
        id: 'gen-2',
        object: 'chat.completion',
        created: 0,
        model: 'qwen/qwen3.8-omni-flash',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: '{"headline": 3}',
              refusal: null,
            },
          },
        ],
      })) as unknown as typeof fetch
    const response = await welcome(post(context))
    expect(response.status).toBe(502)
    expect((await response.json()).code).toBe('welcome_failed')
  })
})
