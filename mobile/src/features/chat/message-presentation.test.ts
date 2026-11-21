// SOURCING: bun:test; regression fixtures for the phone's citation/progress rendering.
import { describe, expect, test } from 'bun:test'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { appRevisionOf, APP_CHECK, ARTIFACT_PART } from '../apps/operations'
import { PROPOSE_EVENT } from '../phone-actions/calendar'
import { SILENT_PARTS } from './parts'
import { activitySummary, additionalAttachments, completionNotice, detailsText, errorMessage, imageUri, object, partKey, placementOf, planReply, sourceOf, toolResultOf, unavailablePreviewText, webUrl } from './message-presentation'

const citation = (id: string, url: string, sourceKind = 'web_search') => ({
  type: 'data', name: 'theorem-citation', data: { citationId: id, label: `Page ${id}`, sourceKind, provenance: { url, excerpt: 'Source excerpt' } },
})
const progress = (label = 'Working') => ({ type: 'data', name: 'theorem-progress', data: { status: 'running', label } })

const approval = (approved?: boolean) => ({
  type: 'tool-call', toolCallId: 'call-1', toolName: 'edit_file',
  artifact: { theoremApproval: { approvalId: 'approval-1', toolCallId: 'call-1', status: 'pending', ...(approved === undefined ? {} : { approved }) } },
})

describe('native reply presentation', () => {
  test('seven retrieved citations do not create seven transcript rows', () => {
    const parts = [
      ...Array.from({ length: 7 }, (_, i) => citation(`${i}`, `https://example.com/${i}`)),
      { type: 'text', text: 'The answer.' }, progress(),
    ]
    const plan = planReply(parts)
    expect(plan.body).toHaveLength(1)
    expect(plan.sources).toHaveLength(7)
    expect(plan.sources.every((source) => source.retrieved)).toBe(true)
    expect(plan.activity).toHaveLength(1)
    expect(activitySummary(parts, { type: 'running' }, true)).toEqual({ label: 'Working', tone: 'live' })
  })

  test('deduplicates retrieved URLs and preserves their explicit citation status', () => {
    const plan = planReply([
      citation('search-1', 'https://example.com/page'),
      citation('read-1', 'https://example.com/page', 'web_read'),
      citation('cited-1', 'https://example.com/page', 'document'),
    ])
    expect(plan.sources).toHaveLength(1)
    expect(plan.sources[0]?.retrieved).toBe(false)
    expect(plan.sources[0]?.excerpt).toBe('Source excerpt')
  })

  test('sources with unsafe or missing URLs are readable but cannot open a URI', () => {
    expect(sourceOf(citation('a', 'javascript:alert(1)'))?.url).toBeUndefined()
    expect(sourceOf(citation('b', 'file:///private/file'))?.url).toBeUndefined()
    expect(webUrl('https://secret:password@example.com')).toBeUndefined()
    expect(webUrl('not a url')).toBeUndefined()
    expect(webUrl('https://example.com/path')).toBe('https://example.com/path')
  })

  test('completed or stopped messages never keep stale Working progress', () => {
    const parts = [progress()]
    expect(activitySummary(parts, { type: 'complete', reason: 'stop' }, true)).toEqual({ label: 'Activity details', tone: 'neutral' })
    expect(activitySummary(parts, { type: 'incomplete', reason: 'cancelled' }, true)).toEqual({ label: 'Stopped', tone: 'neutral' })
    expect(activitySummary(parts, { type: 'incomplete', reason: 'error' }, true)).toEqual({ label: 'Did not finish', tone: 'error' })
    expect(activitySummary([], { type: 'complete' }, false)).toBeUndefined()
  })

  test('pending decisions remain visible and outrank routine progress', () => {
    expect(placementOf(approval())).toBe('body')
    expect(placementOf(approval(true))).toBe('body')
    expect(activitySummary([progress('Reading files'), approval()], { type: 'running' }, true)).toEqual({ label: 'Needs your decision', tone: 'attention' })
    expect(activitySummary([progress('Reading files'), approval(true)], { type: 'running' }, true)?.label).toBe('Reading files')
  })

  test('metadata has no transcript row while unknown user content stays visible', () => {
    for (const name of ['theorem-usage', 'theorem-expression', 'theorem-expression_refused', 'theorem-limits']) {
      expect(placementOf({ type: 'data', name, data: {} })).toBe('internal')
    }
    expect(placementOf({ type: 'data', name: 'theorem-future_chart', data: { title: 'Monthly spending', values: [2, 3] } })).toBe('body')
    expect(placementOf({ type: 'data', name: 'theorem-new_event', data: { sequence: 4, elapsedMs: 13 } })).toBe('activity')
    expect(placementOf({ type: 'future-media', payload: 'x' })).toBe('body')
    expect(placementOf({ type: 'data', name: 'theorem-client_operation', data: { requestRef: 'r' } })).toBe('body')
  })

  test('tool and output identities do not change when streaming data changes', () => {
    expect(partKey({ type: 'tool-call', toolCallId: 'one', argsText: '{' }, 0)).toBe(partKey({ type: 'tool-call', toolCallId: 'one', argsText: '{}' }, 12))
    const plan = planReply([{ type: 'text', id: 'one', text: 'a' }, { type: 'text', id: 'one', text: 'b' }])
    expect(new Set(plan.body.map((entry) => entry.key)).size).toBe(2)
  })

  test('ordinary completion is quiet while actual limits stay visible', () => {
    expect(completionNotice({ stopReason: 'end_turn' })).toBeUndefined()
    expect(completionNotice({ stopReason: 'run_budget' })).toContain('output budget')
    expect(completionNotice({ stopReason: 'step_limit', detail: 'Reached 10 steps.' })).toBe('Reached 10 steps.')
  })

  test('approved tool output and failures remain alongside their approval history', () => {
    for (const result of ['File saved', false, null, 0, '']) {
      const completed = { ...approval(true), result }
      const plan = planReply([completed])
      expect(plan.body).toHaveLength(1)
      expect(toolResultOf(plan.body[0]?.part)).toEqual({ label: 'Tool result', value: result })
    }
    expect(toolResultOf({ ...approval(true), isError: true, result: 'Permission denied' }))
      .toEqual({ label: 'Tool failed', value: 'Permission denied' })
    expect(toolResultOf({ ...approval(true), isError: true })).toEqual({ label: 'Tool failed', value: 'No result was returned.' })
    expect(toolResultOf(approval())).toBeUndefined()
  })

  test('unconfirmed uploads never claim the file is attached', () => {
    for (const state of ['pending', 'uploading', 'paused', 'failed', 'refused', undefined]) {
      expect(unavailablePreviewText(state)).not.toContain('is attached')
    }
    expect(unavailablePreviewText('ready')).toContain('is attached')
  })

  test('standard image-file base64 renders without treating a provider ID as image bytes', () => {
    expect(imageUri('iVBORw0KGgo=', 'image/png')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(imageUri('iVBORw0KGgo=', 'image/png', 'id')).toBeUndefined()
    expect(imageUri('https://example.com/id', 'image/png', 'id')).toBeUndefined()
    expect(imageUri('iVBORw0KGgo=', 'image/png', 'url')).toBeUndefined()
    expect(imageUri('YWJjZA==', 'text/html')).toBeUndefined()
    expect(imageUri('data:text/html;base64,YWJjZA==', 'image/png')).toBeUndefined()
    expect(imageUri('data:image/png;base64,iVBORw0KGgo=', 'image/png')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  test('native attachment metadata is preserved and deduplicated by identity, never filename', () => {
    const first = { id: 'upload-1', name: 'report.pdf', contentType: 'application/pdf', status: { type: 'complete' }, content: [] }
    const second = { ...first, id: 'upload-2' }
    const content = [{ type: 'data', name: 'theorem-attachment', data: { uploadId: 'upload-1', name: 'report.pdf' } }]
    const added = additionalAttachments(content, [first, second])
    expect(added).toHaveLength(1)
    expect(added[0]?.data.attachmentId).toBe('upload-2')
    expect(added[0]?.data.name).toBe('report.pdf')
    expect(added[0]?.data.state).toBe('ready')
    expect(additionalAttachments([], [{ ...second, status: { type: 'incomplete', reason: 'error' } }])[0]?.data.state).toBe('failed')
    expect(additionalAttachments(content, [{ ...second, content }])).toHaveLength(0)
    expect(additionalAttachments([], [second, second])).toHaveLength(1)
  })

  test('public error text does not fall through to diagnostics', () => {
    expect(errorMessage({ message: 'Connection interrupted', diagnostic: 'private stack trace' })).toBe('Connection interrupted')
    expect(errorMessage({ diagnostic: 'private stack trace' })).not.toContain('private')
  })
})


describe('alpha10 and upstream native integration', () => {
  test('SDK-projected App revisions and client operations remain in the mounted reply body', () => {
    const artifact = {
      artifactId: 'app-1', artifactKind: 'app', artifactRevision: 'revision-2',
      payload: { title: 'Counter', documentId: 'document-1', content: '<h1>Counter</h1>', revision: { position: 2 } },
    }
    const check = { requestRef: 'check-1', operation: APP_CHECK, state: 'pending', expectedRevision: 3, args: { documentId: 'document-1' } }
    const calendar = { requestRef: 'calendar-1', operation: PROPOSE_EVENT, state: 'pending', args: { title: 'Review', start: '2026-11-24T10:00' } }
    const [message] = toAssistantMessages([{
      schema: 'theorem/message/1', messageId: 'message-1', tenantId: 'tenant-1', threadId: 'thread-1',
      originBranchId: 'branch-1', role: 'assistant', runId: 'run-1', createdAtMs: 1,
      parts: [
        { partId: 'artifact-1', type: 'artifact', payload: artifact },
        { partId: 'check-1', type: 'client_operation', payload: check },
        { partId: 'calendar-1', type: 'client_operation', payload: calendar },
        { partId: 'usage-1', type: 'usage', payload: { tokens: 22 } },
        { partId: 'progress-1', type: 'progress', payload: { status: 'running', label: 'Working' } },
      ],
    }])
    const content = typeof message?.content === 'string' ? [] : message?.content ?? []
    const plan = planReply(content)
    expect(plan.body).toHaveLength(3)
    expect(plan.body.map(({ part }) => object(part).name)).toEqual([ARTIFACT_PART, 'theorem-client_operation', 'theorem-client_operation'])
    expect(appRevisionOf(object(plan.body[0]?.part).data)?.revision).toBe('revision-2')
    expect(object(plan.body[1]?.part).data).toEqual(check)
    expect(object(plan.body[2]?.part).data).toEqual(calendar)
    expect(plan.activity).toHaveLength(1)
    expect(object(message?.metadata?.custom).theoremRunId).toBe('run-1')
  })

  test('a completed SDK tool never requests a stale approval decision', () => {
    for (const safeOutput of [false, null, 0, '', 'Done', undefined]) {
      const [message] = toAssistantMessages([{
        schema: 'theorem/message/1', messageId: 'message-1', tenantId: 'tenant-1', threadId: 'thread-1',
        originBranchId: 'branch-1', role: 'assistant', createdAtMs: 1,
        parts: [
          { partId: 'approval-1', type: 'tool_approval', payload: { approvalId: 'approval-1', toolCallId: 'call-1', status: 'pending' } },
          { partId: 'result-1', type: 'tool_result', payload: { toolCallId: 'call-1', status: 'completed', safeOutput } },
        ],
      }])
      const parts = typeof message?.content === 'string' ? [] : message?.content ?? []
      expect(toolResultOf(parts[0])?.value).toEqual(safeOutput === undefined ? 'No result was returned.' : safeOutput)
      expect(activitySummary(parts, { type: 'running' }, false)?.label).toBe('Working')
    }
    expect(activitySummary([{ ...approval(), isError: true }], { type: 'running' }, false)?.label).toBe('Working')
    expect(toolResultOf({ ...approval(), result: undefined, interrupt: { type: 'human' } })).toBeUndefined()
    expect(toolResultOf({ type: 'tool-call', result: undefined, isError: false, artifact: { theoremStep: { title: 'Remote step' } } })).toBeUndefined()
  })

  test('inspector keeps exact bigint values without hiding the rest of an alpha10 payload', () => {
    const details = detailsText({ position: 900719925474099312345n, result: { negative: -9007199254740993n, ok: true } })
    expect(JSON.parse(details)).toEqual({
      position: '900719925474099312345',
      result: { negative: '-9007199254740993', ok: true },
    })
    expect(detailsText('x'.repeat(25000))).toContain('Further details are not displayed')
  })

  test('TheoPresence owns only the generic hosted live caption', () => {
    expect(activitySummary([], { type: 'running' }, false, true)).toBeUndefined()
    expect(activitySummary([progress()], { type: 'running' }, true, true)).toEqual({ label: 'Activity details', tone: 'neutral' })
    expect(activitySummary([progress('Reading sources')], { type: 'running' }, true, true)).toEqual({ label: 'Reading sources', tone: 'live' })
    expect(activitySummary([], { type: 'running' }, false, false)).toEqual({ label: 'Working', tone: 'live' })
    expect(activitySummary([], { type: 'incomplete', reason: 'error' }, false, true)?.label).toBe('Did not finish')
    expect(activitySummary([], { type: 'incomplete', reason: 'cancelled' }, false, true)?.label).toBe('Stopped')
    expect(activitySummary([approval()], { type: 'running' }, false, true)?.label).toBe('Needs your decision')
  })

  test('upstream silent parts stay silent and unknown user data remains inspectable', () => {
    for (const name of SILENT_PARTS) {
      const placement = placementOf({ type: 'data', name, data: {} })
      expect(placement).toBe(name === 'theorem-progress' ? 'activity' : 'internal')
    }
    const unknown = { type: 'data', name: 'future-user-content', data: { values: [1, 2] } }
    expect(planReply([unknown], 'user').body[0]?.part).toBe(unknown)
    expect(planReply([unknown]).activity[0]?.part).toBe(unknown)
  })

  test('sources keep explicit titles and distinct URL identities after later retrieval', () => {
    const explicit = { ...citation('reused-id', 'https://example.com/guide', 'document'), data: {
      ...citation('reused-id', 'https://example.com/guide', 'document').data, label: 'Published guide',
    } }
    const plan = planReply([
      explicit,
      citation('reused-id', 'https://example.com/guide'),
      citation('reused-id', 'https://example.com/other'),
    ])
    expect(plan.sources).toHaveLength(2)
    expect(plan.sources[0]?.label).toBe('Published guide')
    expect(plan.sources[0]?.retrieved).toBe(false)
    expect(new Set(plan.sources.map((source) => source.key)).size).toBe(2)
  })

  test('wrapped App identity survives movement in the part list', () => {
    const part = { type: 'data', name: ARTIFACT_PART, data: { payload: { artifactId: 'app-1' } } }
    expect(partKey(part, 0)).toBe(partKey(part, 8))
  })
})
