// SOURCING: none — temporary fixture page for checking the delegation cards; deleted before commit
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { DELEGATION_RENDERERS } from '@/components/chat/delegation-parts'
import { ComposerReferences } from '@/components/chat/composer-references'
import { DelegationPanel } from '@/components/chat/delegation-panel'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'

const runId = 'run_front_1'
const patch = [
  '@@ -1,6 +1,8 @@',
  " import { create } from 'zustand'",
  " import { Icon } from '@/components/icons'",
  "+import { cn } from '@/lib/utils'",
  ' ',
  ' export function Toolbar() {',
  '-  return <div className="toolbar">{children}</div>',
  '+  const dense = useDensity()',
  "+  return <div className={cn('toolbar', dense && 'gap-1')}>{children}</div>",
  ' }',
  '',
].join('\n')

const reviewed = {
  delegationId: 'del_1',
  parentRunId: runId,
  childRunId: 'run_child_1',
  roleId: 'implementer',
  roleLabel: 'Implementer',
  model: 'openrouter/minimax/minimax-m3',
  state: 'reviewed',
  objective: 'Make the toolbar dense on small screens and add a test.',
  fileScope: ['src/components/toolbar.tsx', 'src/components/toolbar.test.tsx'],
  criteria: ['Toolbar uses gap-1 when dense', 'A test covers the dense layout', 'No other component changes'],
  intent: { intentId: 'intent_1', revision: 2 },
  verdict: 'accept',
  reviewId: 'intent:intent_1',
  updatedAtMs: Date.now(),
  receipt: {
    terminal: { kind: 'completed' },
    commandCount: 7,
    contentHash: 'sha256:abc',
    usage: { promptTokens: 18234, completionTokens: 2210, reasoningTokens: 900, costMicrounits: 31000 },
    checks: [
      { checkId: 'c1', argv: ['bun', 'run', 'typecheck'], status: 'passed', exitCode: 0 },
      { checkId: 'c2', argv: ['bun', 'test', 'src/components/toolbar.test.tsx'], status: 'failed', exitCode: 1, outputRef: 'out_1' },
      { checkId: 'c3', argv: ['bun', 'run', 'lint'], status: 'not_run' },
    ],
    reported: {
      summary: 'Added a density hook to the toolbar and a test for the dense layout. The test fails on the existing snapshot, which I left for review.',
      completedCriteria: ['Toolbar uses gap-1 when dense', 'No other component changes'],
      skipped: [{ requirement: 'Update the snapshot', reason: 'Outside the file scope' }],
      deviations: [],
      assumptions: ['Dense means under 640px'],
      unresolved: ['The snapshot needs regenerating'],
    },
    changes: [
      { path: 'src/components/toolbar.tsx', change: 'modify', beforeRef: 'b1', afterRef: 'a1', diffRef: 'd1', linesAdded: 3, linesRemoved: 2, binary: false, admission: { state: 'admitted' } },
      { path: 'src/components/toolbar.test.tsx', change: 'add', afterRef: 'a2', diffRef: 'd2', linesAdded: 12, linesRemoved: 0, binary: false, admission: { state: 'pending' } },
      { path: 'src/components/legacy-toolbar.tsx', change: 'delete', beforeRef: 'b3', diffRef: 'd3', linesAdded: 0, linesRemoved: 40, binary: false, admission: { state: 'conflict', detail: 'The file changed in the workspace after the overlay was made.' } },
      { path: 'public/toolbar.png', change: 'modify', beforeRef: 'b4', afterRef: 'a4', binary: true, admission: { state: 'out_of_scope' } },
    ],
  },
}

const parts = [
  ['theorem-intent', {
    intentId: 'intent_1', revision: 2, status: 'open',
    goal: 'Make the toolbar usable on small screens without changing other components.',
    successCriteria: [{ id: 's1', text: 'The toolbar fits a 375px viewport' }, { id: 's2', text: 'Tests cover the dense layout' }],
    nonGoals: [{ id: 'n1', text: 'Redesigning the toolbar', protectedPaths: ['src/components/shell/'] }],
    constraints: ['Keep the existing icon set'],
    supersedes: 1,
  }],
  ['theorem-delegation', reviewed],
  ['theorem-delegation', { ...reviewed, delegationId: 'del_2', state: 'started', roleLabel: 'Tester', objective: 'Regenerate the toolbar snapshot.', receipt: undefined, verdict: undefined, criteria: ['Snapshot matches the dense layout'] }],
  ['theorem-delegation', { ...reviewed, delegationId: 'del_3', state: 'failed', roleLabel: 'Researcher', model: 'openrouter/moonshotai/kimi-k3', objective: 'Find how other apps size dense toolbars.', receipt: undefined, verdict: undefined, criteria: [], problem: 'The specialist ran out of its command budget.' }],
  ['theorem-review', {
    reviewId: 'intent:intent_1', intent: { intentId: 'intent_1', revision: 2 }, intentOutcome: 'remains_open',
    verdicts: [{ delegationId: 'del_1', roleLabel: 'Implementer', verdict: 'accept', rationale: 'Meets the toolbar criteria.' }, { delegationId: 'del_3', roleLabel: 'Researcher', verdict: 'reject', rationale: 'No findings.' }],
    admissions: [{ delegationId: 'del_1', path: 'src/components/legacy-toolbar.tsx', admission: { state: 'conflict', detail: 'changed on disk' } }],
    summary: 'The toolbar change is admitted; the snapshot still needs regenerating, so the intent stays open.',
    reviewerRole: 'Reviewer', decidedAtMs: Date.now(),
  }],
] as const

const thread: ThreadMessageLike[] = [
  {
    id: 'msg_front',
    role: 'assistant',
    content: parts.map(([name, data]) => ({ type: 'data', name, data })),
    status: { type: 'complete', reason: 'stop' },
  },
]

const specialistParts = [
  { partId: 'p1', type: 'reasoning', payload: { partId: 'p1', type: 'reasoning', text: 'The toolbar reads its gap from a constant; a density hook keeps the change inside the file scope.' } },
  { partId: 'p2', type: 'tool_call', payload: { partId: 'p2', type: 'tool_call', toolCallId: 't1', toolName: 'read_file', safeArguments: { path: 'src/components/toolbar.tsx' } } },
  { partId: 'p3', type: 'tool_result', payload: { partId: 'p3', type: 'tool_result', toolCallId: 't1', toolName: 'read_file', safeOutput: 'export function Toolbar() { ... }', status: 'succeeded' } },
  { partId: 'p4', type: 'text', payload: { partId: 'p4', type: 'text', text: 'Added `useDensity` to the toolbar and a test for the dense layout. The snapshot test fails until the snapshot is regenerated.' } },
]

export const Route = createFileRoute('/dev-delegation')({ component: DevDelegation })

function DevDelegation() {
  const client = useQueryClient()
  useState(() => {
    const key = (ref: string) => ['delegation-content', runId, 'del_1', ref]
    client.setQueryData(key('d1'), patch)
    client.setQueryData(key('d2'), `@@ -0,0 +1,3 @@\n+import { test } from 'bun:test'\n+\n+test('dense toolbar', () => {})\n`)
    client.setQueryData(key('d3'), `@@ -1,2 +0,0 @@\n-export function LegacyToolbar() {}\n-export default LegacyToolbar\n`)
    client.setQueryData(key('out_1'), 'FAIL src/components/toolbar.test.tsx\n  dense toolbar\n    expect(received).toMatchSnapshot()\n    Snapshot does not match: gap-2 != gap-1\n\n1 fail, 0 pass')
    client.setQueryData(['specialist-run', 'run_child_1'], {
      parts: new Map(specialistParts.map((part) => [part.partId, part])),
      ended: 'RUN.CLOSED',
    })
    return null
  })
  const renderers = new Map(DELEGATION_RENDERERS)
  const runtime = useExternalStoreRuntime({
    messages: thread,
    convertMessage: (message: ThreadMessageLike) => message,
    onNew: async () => {},
  })
  return (
    <main className="mx-auto max-w-3xl bg-background p-6 text-ink">
      <div className="mb-4 rounded-lg border border-separator p-2">
        <ComposerReferences />
        <textarea className="aui-composer-input w-full bg-transparent p-2" placeholder="composer" />
      </div>
      {parts.map(([name, data], index) => {
        const Render = renderers.get(name)!
        return <Render key={index} type="data" name={name} data={data} status={{ type: 'complete' }} />
      })}
      <div data-testid="panel" className="mt-8 h-[900px] w-[520px] overflow-hidden rounded-lg border border-separator">
        <AssistantRuntimeProvider runtime={runtime}>
          <TheoremPartRenderers />
          <DelegationPanel delegationId="del_1" />
        </AssistantRuntimeProvider>
      </div>
    </main>
  )
}
