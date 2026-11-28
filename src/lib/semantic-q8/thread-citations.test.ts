import { expect, test } from 'bun:test'
import type { Theorem } from '../theorem/client'
import { threadCitations } from './thread-citations'

test('search uses each exact saved part, not a source group or a snippet', () => {
  const capture = (version: string) => ({
    sourceId: 'one-page',
    sourceKind: 'web_read',
    label: 'Research',
    provenance: {
      excerpt: 'same',
      source: {
        handle: `source:${version}`,
        version,
        extractionVersion: 'extractor/2',
        textBasis: 'utf8-extracted-text',
        textBytes: 100,
        coverage: { status: 'complete' },
      },
      span: { startByte: 4, endByte: 8 },
    },
  })
  const saved: Theorem.Message = {
    schema: 'theorem.chat.message.v1',
    messageId: 'saved',
    tenantId: 'tenant',
    threadId: 'thread',
    originBranchId: 'branch',
    role: 'assistant',
    createdAtMs: 1,
    parts: [
      { partId: 'second', type: 'citation', payload: capture('v2') },
      {
        partId: 'snippet',
        type: 'citation',
        payload: { sourceKind: 'web_search', provenance: { excerpt: 'same' } },
      },
      { partId: 'first', type: 'citation', payload: capture('v1') },
    ],
  }
  const citations = threadCitations([
    saved,
    { ...saved, role: 'user', messageId: 'not-evidence' },
  ])
  expect(
    citations.map(({ messageId, partId, source }) => [
      messageId,
      partId,
      source.capture?.version,
    ]),
  ).toEqual([
    ['saved', 'second', 'v2'],
    ['saved', 'first', 'v1'],
  ])
})
