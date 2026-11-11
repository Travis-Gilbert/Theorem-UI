// SOURCING: none: a conversation with the things Theo can be sent to (a tool call that failed among ones that did not, a document with sections, a worker's changed file and its diff), in the SDK's own message shape, long enough that some of it is out of view.
import type { Theorem } from '@/lib/theorem/client'
import type { DelegationPart } from '@/lib/theorem/delegations'

const ASKED_AT = Date.UTC(2026, 10, 11, 15)

const message = (
  messageId: string,
  role: Theorem.MessageRole,
  createdAtMs: number,
  parts: Theorem.StoredPart[],
): Theorem.Message => ({
  schema: 'theorem.chat.message.v1',
  messageId,
  tenantId: 'story',
  threadId: 'thread-pointing',
  originBranchId: 'branch-main',
  role,
  parts,
  createdAtMs,
})

const said = (partId: string, text: string): Theorem.StoredPart => ({
  partId,
  type: 'text',
  payload: { text },
})

const call = (
  toolCallId: string,
  toolName: string,
  safeArguments: Record<string, unknown>,
  status: 'complete' | 'failed',
  safeOutput: Record<string, unknown>,
): Theorem.StoredPart[] => [
  {
    partId: `${toolCallId}-call`,
    type: 'tool_call',
    payload: { toolCallId, toolName, safeArguments },
  },
  {
    partId: `${toolCallId}-result`,
    type: 'tool_result',
    payload: { toolCallId, status, safeOutput },
  },
]

export const POINTING_RUN = 'run-pointing'
export const POINTING_DELEGATION = 'dlg-tiles'
export const POINTING_CHANGE = 'examples/map/main.ts'

/** The worker's change to the one file, as the receipt stores it. */
export const POINTING_PATCH = `--- a/${POINTING_CHANGE}
+++ b/${POINTING_CHANGE}
@@ -1,12 +1,12 @@
 import { createMap } from '../../src/map'
-import { tileUrl } from '../../src/tiles/helper'
+import { tileUrl } from '../../src/tiles/url'
 import { styles } from './styles'
 
 const map = createMap(document.querySelector('#map'), {
   centre: [51.5, -0.12],
   zoom: 11,
-  tiles: tileUrl('osm'),
+  tiles: tileUrl('osm', { retina: true }),
   styles,
 })
 
 map.on('ready', () => map.fit())
`

export const pointingDelegation: DelegationPart = {
  delegationId: POINTING_DELEGATION,
  parentRunId: POINTING_RUN,
  childRunId: 'run-pointing-child',
  roleId: 'code.implementer',
  roleLabel: 'Implementer',
  model: 'provider/model',
  state: 'published',
  objective: 'Point the map example at the tile helper where it now lives.',
  fileScope: ['examples/map'],
  criteria: ['The map example builds'],
  intent: { intentId: 'intent-tiles', revision: 1 },
  updatedAtMs: ASKED_AT + 80_000,
  receipt: {
    terminal: { kind: 'completed' },
    changes: [
      {
        path: POINTING_CHANGE,
        change: 'modify',
        diffRef: 'diff-map-main',
        linesAdded: 2,
        linesRemoved: 2,
        binary: false,
        admission: { state: 'admitted' },
      },
    ],
    checks: [],
    commandCount: 3,
    contentHash: 'story-receipt',
    reported: {
      summary: 'The map example imports the tile helper from src/tiles/url.',
      completedCriteria: ['The map example builds'],
      skipped: [],
      deviations: [],
      assumptions: [],
      unresolved: [],
    },
  },
}

const REPORT = `# Build report

## What broke

The map example imported \`tileUrl\` from \`src/tiles/helper\`, a file that was
renamed to \`src/tiles/url\` last week. Nothing else in the gallery used the
old path.

## What changed

One import in \`examples/map/main.ts\`, and the call beside it now asks for
retina tiles, which the renamed helper takes as an option.

## What is left

The gallery's own README still names the old file. It builds either way.
`

const artifact = (): Theorem.StoredPart => ({
  partId: 'pointing-report',
  type: 'artifact',
  payload: {
    artifactId: 'art_build_report',
    artifactRevision: 'rev_1',
    artifactKind: 'document',
    rendererId: 'theorem-document',
    contractVersion: 'theorem-artifact-v1',
    lifecycle: 'ready',
    patchSequence: 1,
    fallbackText: 'Build report',
    payload: {
      documentId: 'doc_build_report',
      revision: { position: 1 },
      title: 'Build report',
      content: REPORT,
      language: 'markdown',
    },
  },
})

/** Two questions and their replies: the first did the work, the second is what the person sees. */
export function pointingMessages(): Theorem.Message[] {
  return [
    message('pointing-ask', 'user', ASKED_AT, [
      said('pointing-ask-text', 'Why did the gallery build break overnight?'),
    ]),
    message('pointing-answer', 'assistant', ASKED_AT + 90_000, [
      {
        partId: 'pointing-reasoning',
        type: 'reasoning',
        payload: {
          text: 'Building each example alone shows which one fails and on what.',
        },
      },
      ...call('call-list', 'list_files', { path: 'examples' }, 'complete', {
        entries: 12,
      }),
      ...call(
        'call-build',
        'bash',
        { command: 'bun run build:examples' },
        'failed',
        {
          exitCode: 1,
          stderr:
            "error: Could not resolve '../../src/tiles/helper' from examples/map/main.ts",
          built: 11,
          failed: 1,
        },
      ),
      ...call('call-search', 'search_code', { query: 'tileUrl' }, 'complete', {
        hits: ['src/tiles/url.ts', 'examples/map/main.ts'],
      }),
      said(
        'pointing-answer-text',
        'Eleven of the twelve examples build. The map example fails: it imports a tile helper from a path that was renamed last week. I had a worker point it at the new file.',
      ),
      {
        partId: 'pointing-work',
        type: 'delegation',
        payload: pointingDelegation,
      },
      artifact(),
    ]),
    message('pointing-again', 'user', ASKED_AT + 200_000, [
      said('pointing-again-text', 'Does anything else still use the old path?'),
    ]),
    message('pointing-reply', 'assistant', ASKED_AT + 230_000, [
      said(
        'pointing-reply-text',
        [
          'No code does. I searched the whole tree for the old path and for the old file name.',
          'The gallery README mentions it once, in the list of helpers. That is prose, so nothing breaks, but it will mislead whoever reads it next.',
          'The tests import the helper through the package entry, which already pointed at the new file, so they were never affected.',
          'If you would like the README fixed in the same change, say so and I will add it.',
        ].join('\n\n'),
      ),
    ]),
  ]
}
