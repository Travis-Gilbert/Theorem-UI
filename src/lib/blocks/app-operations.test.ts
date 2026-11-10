// SOURCING: bun:test over the page's App operations (app-operations.ts): the
// requests read off a conversation, the answers, and the receipts posted.
import { describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { KIT_OPERATIONS } from '@/lib/kit/operations'
import { useKitStage } from '@/lib/kit/stage'
import { clientSurfaceTurnOptions } from '@/lib/theorem/client-surface'
import type { AppInspection } from './app-inspect'
import {
  APP_OPERATIONS,
  answerAppRequest,
  appRequestsOf,
  serveAppRequests,
} from './app-operations'
import type { AppOperationHost, AppReceipt, AppRequest } from './app-operations'

const CLEAN: AppInspection = {
  built: true,
  files: ['main.tsx'],
  problems: [],
  omitted: 0,
  typesChecked: true,
  ranMs: 1500,
  rendered: { text: 'Alder Birch', elements: 6 },
}

function host(overrides: Partial<AppOperationHost> = {}) {
  const inspected: Array<{ html: string; runMs?: number }> = []
  const loaded: Array<string> = []
  const value: AppOperationHost = {
    inspect: async (html, options) => {
      inspected.push({ html, ...options })
      return CLEAN
    },
    load: async (documentId) => {
      loaded.push(documentId)
      return { html: '<p>Saved</p>', revision: { position: 7 } }
    },
    ...overrides,
  }
  return { host: value, inspected, loaded }
}

const request = (
  args: Record<string, unknown>,
  ref = `ref-${Math.random()}`,
): AppRequest => ({
  runId: 'run-1',
  requestRef: ref,
  operation: 'app.check',
  args,
  expectedRevision: 3,
})

const operation = (data: Record<string, unknown>) =>
  ({ type: 'data', name: 'theorem-client_operation', data }) as const
const assistant = (...content: Array<ReturnType<typeof operation>>) =>
  ({
    role: 'assistant',
    content,
    metadata: { custom: { theoremRunId: 'run-1' } },
  }) as unknown as ThreadMessage

describe('the operations a turn declares', () => {
  test('app.check is one, within what Theorem admits of a declaration', () => {
    expect(APP_OPERATIONS.map(({ name }) => name)).toEqual(['app.check'])
    for (const declared of APP_OPERATIONS) {
      expect(declared.name).toMatch(/^[a-z][a-z0-9_.]{2,63}$/)
      expect(declared.description.length).toBeLessThanOrEqual(1024)
      expect(JSON.stringify(declared.inputSchema).length).toBeLessThanOrEqual(
        8 * 1024,
      )
      expect(['read', 'presentation']).toContain(declared.effect)
    }
  })

  test('a send declares checking Apps, and Kit beside it while Kit is on screen', () => {
    useKitStage.setState({ mounted: false })
    expect(clientSurfaceTurnOptions()).toEqual({
      clientOperations: [...APP_OPERATIONS],
      clientSurface: { revision: 0 },
    })
    useKitStage.setState({ mounted: true, revision: 12 })
    try {
      const options = clientSurfaceTurnOptions()
      expect(options.clientSurface).toEqual({ revision: 12 })
      expect(options.clientOperations).toEqual([
        ...KIT_OPERATIONS,
        ...APP_OPERATIONS,
      ])
      // Theorem admits at most 16 operations for a run.
      expect(options.clientOperations.length).toBeLessThanOrEqual(16)
    } finally {
      useKitStage.setState({ mounted: false })
    }
  })
})

describe('reading requests off a conversation', () => {
  test("the live turn's pending App requests, and nobody else's", () => {
    const messages = [
      assistant(
        operation({
          operation: 'app.check',
          requestRef: 'a',
          args: { html: '<p>Draft</p>' },
          expectedRevision: 4,
        }),
        operation({ operation: 'kit.wave', requestRef: 'b', args: {} }),
        operation({
          operation: 'app.check',
          requestRef: 'c',
          state: 'answered',
        }),
      ),
    ]
    expect(appRequestsOf(messages, true)).toEqual([
      {
        runId: 'run-1',
        requestRef: 'a',
        operation: 'app.check',
        args: { html: '<p>Draft</p>' },
        expectedRevision: 4,
      },
    ])
    // A turn that has ended has nobody waiting for an answer.
    expect(appRequestsOf(messages, false)).toEqual([])
  })
})

describe('answering a check', () => {
  test('a draft is checked as it is given', async () => {
    const page = host()
    const answer = await answerAppRequest(
      request({ html: '<p>Draft</p>', runMs: 0 }),
      page.host,
    )
    expect(answer).toEqual({ outcome: 'applied', result: CLEAN })
    expect(page.inspected).toEqual([{ html: '<p>Draft</p>', runMs: 0 }])
    expect(page.loaded).toEqual([])
  })

  test('a published App is checked as it is saved, and says which revision', async () => {
    const page = host()
    const answer = await answerAppRequest(
      request({ documentId: 'app-document' }),
      page.host,
    )
    expect(page.loaded).toEqual(['app-document'])
    expect(page.inspected).toEqual([{ html: '<p>Saved</p>' }])
    expect(answer.result).toEqual({ ...CLEAN, revision: '7' })
  })

  test('problems are a check that was made, not one that failed', async () => {
    const found: AppInspection = {
      ...CLEAN,
      built: false,
      problems: [
        { kind: 'build', message: 'Unexpected "}"', file: 'main.tsx', line: 2 },
      ],
    }
    const answer = await answerAppRequest(
      request({ html: '<p>x</p>' }),
      host({ inspect: async () => found }).host,
    )
    expect(answer).toEqual({ outcome: 'applied', result: found })
  })

  test('a check that cannot be made says why', async () => {
    const answer = await answerAppRequest(
      request({ documentId: 'gone' }),
      host({
        load: async () => {
          throw new Error('This document is not an editable App')
        },
      }).host,
    )
    expect(answer).toEqual({
      outcome: 'failed',
      reason: 'This document is not an editable App',
    })
  })

  test('a request that names nothing, or another operation, is refused', async () => {
    expect((await answerAppRequest(request({}), host().host)).outcome).toBe(
      'rejected',
    )
    expect(
      (
        await answerAppRequest(
          { ...request({ html: '<p>x</p>' }), operation: 'app.publish' },
          host().host,
        )
      ).outcome,
    ).toBe('rejected')
  })
})

describe('serving requests', () => {
  test('each is answered once, in order, with the revision the run expects', async () => {
    const page = host()
    const posted: Array<[string, AppReceipt]> = []
    const post = async (asked: AppRequest, receipt: AppReceipt) => {
      posted.push([asked.requestRef, receipt])
    }
    const first = request({ html: '<p>One</p>' }, 'serve-1')
    const second = request({ html: '<p>Two</p>' }, 'serve-2')
    await serveAppRequests([first, second], post, page.host)
    // The conversation reports the same pending requests again as it re-renders.
    await serveAppRequests([first, second], post, page.host)
    expect(posted.map(([ref]) => ref)).toEqual(['serve-1', 'serve-2'])
    expect(posted[0]![1]).toEqual({
      outcome: 'applied',
      result: CLEAN,
      revision: 3,
    })
    expect(page.inspected.map(({ html }) => html)).toEqual([
      '<p>One</p>',
      '<p>Two</p>',
    ])
  })

  test('a receipt that fails to post is sent again without checking again', async () => {
    const page = host()
    let attempts = 0
    await serveAppRequests(
      [request({ html: '<p>Retry</p>' }, 'serve-retry')],
      async () => {
        attempts += 1
        if (attempts < 3) throw new Error('offline')
      },
      page.host,
      () => 1,
    )
    expect(attempts).toBe(3)
    expect(page.inspected).toHaveLength(1)
  })
})
