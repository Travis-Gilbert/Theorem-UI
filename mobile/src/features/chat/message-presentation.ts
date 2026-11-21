// SOURCING: Theorem-UI src/components/chat/theorem-parts.tsx and lib/theorem/run-parts.ts.
// Pure presentation policy: the native and web views share meaning, not DOM components.
import { awaitsDecision, readApproval } from './approval'
import { SILENT_PARTS } from './parts'

export type Json = Record<string, unknown>
export const object = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
export const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined

/** Only web links may leave a message. Credentials are never attached to them. */
export function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.href : undefined
  } catch { return undefined }
}

export type SourceReference = {
  key: string
  label: string
  url?: string
  excerpt?: string
  retrieved: boolean
}

export function sourceOf(value: unknown): SourceReference | undefined {
  const part = object(value)
  const data = part.type === 'source' ? part : object(part.data)
  if (part.type !== 'source' && !(part.type === 'data' && part.name === 'theorem-citation')) return undefined
  const provenance = object(data.provenance)
  const url = webUrl(provenance.url ?? data.url)
  const label = string(data.label) ?? string(data.title) ?? (url ? new URL(url).hostname : 'Source')
  const excerpt = string(provenance.excerpt) ?? string(data.excerpt)
  const identity = string(data.citationId) ?? string(data.sourceId) ?? string(data.id)
  // A malformed citation still gets an honest, non-clickable source entry.
  return {
    key: identity ?? url ?? `${label}:${excerpt ?? ''}`,
    label, ...(url ? { url } : {}), ...(excerpt ? { excerpt } : {}),
    retrieved: data.sourceKind === 'web_search' || data.sourceKind === 'web_read',
  }
}

export type PartPlacement = 'body' | 'activity' | 'source' | 'internal'
const INTERNAL = new Set(['theorem-usage', 'theorem-expression', 'theorem-expression_refused', 'theorem-limits'])
const ACTIVITY = new Set([
  'theorem-progress', 'theorem-reasoning_summary', 'theorem-host_call', 'theorem-program',
  'theorem-delegation', 'theorem-review', 'theorem-intent', 'theorem-skill_load',
])
const CONTENT = new Set([
  'theorem-attachment', 'theorem-artifact', 'theorem-scene', 'theorem-error', 'theorem-completion',
  'theorem-user_input', 'theorem-client_operation', 'theorem-context_manifest',
  'theorem-record_change_proposal', 'theorem-record_change_outcome', 'theorem-review_answer',
  'theorem-question',
])
const CONTENT_FIELDS = ['text', 'content', 'markdown', 'html', 'url', 'href', 'image', 'fileName', 'filename', 'title', 'question', 'questions', 'options', 'artifactId', 'documentId']

/** Unknown events remain inspectable; possible user content must never disappear. */
export function placementOf(value: unknown): PartPlacement {
  const part = object(value)
  if (sourceOf(part)) return 'source'
  if (part.type === 'reasoning') return 'activity'
  if (part.type === 'tool-call') return readApproval(part.artifact) ? 'body' : 'activity'
  if (part.type !== 'data') return 'body'
  const name = string(part.name) ?? ''
  // Keep upstream's silent semantics; progress contributes to the one activity row.
  if (INTERNAL.has(name) || (SILENT_PARTS.has(name) && name !== 'theorem-progress')) return 'internal'
  if (ACTIVITY.has(name)) return 'activity'
  if (CONTENT.has(name)) return 'body'
  const data = object(part.data)
  if (typeof part.data === 'string' && part.data.trim()) return 'body'
  return CONTENT_FIELDS.some((key) => data[key] !== undefined) ? 'body' : 'activity'
}

/** Stable event/part identity survives updates. A slot is a last resort for old payloads. */
export function partKey(value: unknown, index: number): string {
  const part = object(value)
  const data = object(part.data)
  const payload = object(data.payload)
  const id = string(part.id) ?? string(part.toolCallId) ?? string(data.partId) ?? string(data.id)
    ?? string(data.requestRef) ?? string(data.citationId) ?? string(data.uploadId) ?? string(data.attachmentId)
    ?? string(data.artifactId) ?? string(payload.artifactId)
  return `${String(part.type)}:${String(part.name ?? '')}:${id ?? index}`
}

export function planReply<T>(parts: readonly T[], role: 'user' | 'assistant' = 'assistant') {
  const body: { part: T; key: string }[] = []
  const activity: { part: T; key: string }[] = []
  const sources = new Map<string, SourceReference>()
  const keys = new Map<string, number>()
  parts.forEach((part, index) => {
    const base = partKey(part, index)
    const duplicate = keys.get(base) ?? 0
    keys.set(base, duplicate + 1)
    const key = duplicate ? `${base}:${duplicate}` : base
    const place = placementOf(part)
    if (place === 'source') {
      const source = sourceOf(part)!
      // Same URL can be retrieved repeatedly or then become an explicit citation.
      const sourceKey = source.url ?? source.key
      const prior = sources.get(sourceKey)
      if (!prior) sources.set(sourceKey, { ...source, key: sourceKey })
      else {
        // An explicit citation keeps its label even if a later search retrieves it again.
        const preferred = prior.retrieved && !source.retrieved ? source : prior
        const fallback = preferred === prior ? source : prior
        sources.set(sourceKey, {
          ...fallback, ...preferred, key: sourceKey,
          retrieved: prior.retrieved && source.retrieved,
          excerpt: preferred.excerpt ?? fallback.excerpt,
        })
      }
    } else if (place === 'body' || (role === 'user' && place === 'activity')) body.push({ part, key })
    else if (place === 'activity') activity.push({ part, key })
  })
  return { body, activity, sources: [...sources.values()] }
}

export type ActivitySummary = { label: string; tone: 'neutral' | 'live' | 'attention' | 'error' }
const LIVE_STATUSES = new Set(['running', 'working', 'in_progress', 'pending', 'streaming'])

/** Message lifecycle wins over a stale progress label such as "Working". */
export function activitySummary(parts: readonly unknown[], rawStatus: unknown, hasDetails: boolean, liveStatusInPresence = false): ActivitySummary | undefined {
  const status = object(rawStatus)
  if (status.type === 'incomplete') return status.reason === 'cancelled'
    ? { label: 'Stopped', tone: 'neutral' } : { label: 'Did not finish', tone: 'error' }
  if (status.type === 'requires-action') return { label: 'Needs your decision', tone: 'attention' }
  if (status.type === 'running') {
    const waiting = parts.some((value) => {
      const part = object(value)
      const approval = part.type === 'tool-call' && readApproval(part.artifact)
      return approval && !toolResultOf(part) && awaitsDecision(approval)
    })
    if (waiting) return { label: 'Needs your decision', tone: 'attention' }
    const progress = object(object(parts.findLast((value) => object(value).name === 'theorem-progress')).data)
    const label = LIVE_STATUSES.has(string(progress.status) ?? '') ? string(progress.label) : undefined
    if (liveStatusInPresence && (!label || label === 'Working'))
      return hasDetails ? { label: 'Activity details', tone: 'neutral' } : undefined
    return { label: label ?? 'Working', tone: 'live' }
  }
  return hasDetails ? { label: 'Activity details', tone: 'neutral' } : undefined
}

export function activityTitle(value: unknown): string {
  const part = object(value)
  const data = object(part.data)
  if (part.type === 'reasoning' || part.name === 'theorem-reasoning_summary') return 'Reasoning summary'
  if (part.type === 'tool-call') {
    const step = object(object(part.artifact).theoremStep)
    return string(step.title) ?? (string(part.toolName) ?? 'Tool').replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ')
  }
  if (part.name === 'theorem-progress') return string(data.label) ?? 'Progress update'
  return string(data.title) ?? string(data.summary) ?? string(data.label) ?? 'Event details'
}

export function errorMessage(data: unknown): string {
  const value = object(data)
  // Match the web's public event contract. Raw diagnostic/detail fields are not user messages.
  const message = string(value.message) ?? 'The response was interrupted. Reload the conversation to check its saved history.'
  const reference = string(value.correlation_id) ?? string(value.correlationId)
  return reference ? `${message} Reference: ${reference}` : message
}

export function completionNotice(data: unknown): string | undefined {
  const value = object(data)
  const reason = string(value.stopReason)
  const labels: Record<string, string> = {
    max_output_tokens: 'This reply reached its output limit for one step.',
    run_budget: 'This run used its output budget.',
    step_limit: 'This run reached its limit on steps.',
  }
  return reason && labels[reason] ? string(value.detail) ?? labels[reason] : undefined
}

/** The result survives approval history on the same tool-call part. False/null/empty are results too. */
export function toolResultOf(value: unknown): { label: string; value: unknown } | undefined {
  const part = object(value)
  if (part.type !== 'tool-call') return undefined
  // alpha10 tool_result clears an approval interrupt even if safeOutput is omitted.
  // Core normalization preserves these own fields. Remote pending steps also set
  // result: undefined, so neither that field alone nor absence of output proves completion.
  const completedApprovalWithoutOutput = readApproval(part.artifact)
    && Object.hasOwn(part, 'result') && Object.hasOwn(part, 'interrupt')
    && part.interrupt === undefined && part.isError === false
  if (part.result === undefined && !part.isError && !completedApprovalWithoutOutput) return undefined
  return { label: part.isError ? 'Tool failed' : 'Tool result', value: part.result ?? (part.result === null ? null : 'No result was returned.') }
}

/** Native file parts use raw base64 unless their sourceType says URL or provider ID. */
export function imageUri(value: unknown, mime?: string, sourceType?: unknown): string | undefined {
  if (sourceType === 'id') return undefined
  const url = webUrl(value)
  if (url) return url
  if (typeof value !== 'string' || value.length > 12 * 1024 * 1024) return undefined
  const supported = /^image\/(png|jpe?g|webp|gif|avif|heic)$/
  if (/^data:image\/(png|jpe?g|webp|gif|avif|heic);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) return value
  const mediaType = mime?.split(';')[0]?.trim().toLowerCase()
  const bytes = value.replace(/[\r\n]/g, '')
  return sourceType !== 'url' && mediaType && supported.test(mediaType) && bytes.length >= 4
    && bytes.length % 4 !== 1 && /^[A-Za-z0-9+/]+={0,2}$/.test(bytes)
    ? `data:${mediaType};base64,${bytes}` : undefined
}

export function unavailablePreviewText(state: unknown): string {
  if (state === 'pending' || state === 'uploading') return 'The upload has not finished.'
  if (state === 'paused') return 'The upload is paused.'
  if (state === 'failed') return 'This file could not be uploaded.'
  if (state === 'refused') return 'This file was not accepted.'
  return state === 'ready' ? 'This file is attached. A preview is not available on this device yet.'
    : 'A preview is not available on this device yet.'
}

/** Preserve native AUI attachments that are not already carried as a content part. IDs, never names, dedupe. */
export function additionalAttachments(content: readonly unknown[], rawAttachments: unknown) {
  const represented = new Set<string>()
  for (const value of content) {
    const part = object(value)
    const data = object(part.data)
    for (const id of [part.id, data.id, data.uploadId, data.attachmentId]) if (typeof id === 'string') represented.add(id)
  }
  if (!Array.isArray(rawAttachments)) return []
  return rawAttachments.flatMap((value) => {
    const attachment = object(value)
    const id = string(attachment.id)
    if (!id || represented.has(id)) return []
    const parts: unknown[] = Array.isArray(attachment.content) ? attachment.content : []
    if (parts.some((part) => {
      const p = object(part); const data = object(p.data)
      return [p.id, data.id, data.uploadId, data.attachmentId].some((key) => typeof key === 'string' && represented.has(key))
    })) return []
    represented.add(id)
    const source = object(parts.find((part) => ['image', 'file'].includes(String(object(part).type))))
    const status = object(attachment.status)
    const state = status.type === 'complete' ? 'ready' : status.type === 'running' ? 'uploading'
      : status.type === 'incomplete' ? (status.reason === 'upload-paused' ? 'paused' : 'failed') : 'pending'
    return [{ type: 'data' as const, name: 'theorem-attachment', data: {
      attachmentId: id, name: string(attachment.name) ?? 'File',
      mediaType: string(attachment.contentType) ?? string(source.mimeType), state,
      ...(source.type === 'image' ? { image: source.image } : {}),
      ...(source.type === 'file' ? { data: source.data, sourceType: source.sourceType } : {}),
    } }]
  })
}

/** Bounded inspector text, never used as the primary representation of known content. */
export function detailsText(value: unknown): string {
  let text: string
  try {
    // alpha10 preserves wire integers as bigint. Inspect them without rounding or losing the object.
    text = typeof value === 'string' ? value : JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item, 2) ?? ''
  }
  catch { text = 'The details could not be read.' }
  return text.length > 24000 ? `${text.slice(0, 24000)}\n\n…Further details are not displayed.` : text
}
