// SOURCING: none — a typed reader for the theorem-artifact-v1 part contract (apps/theoremweb/contracts/theorem-chat-v1.json); no library models Theorem's artifact parts
import { useAuiState } from '@assistant-ui/react'
import { useMemo } from 'react'

/** One revision of an agent-produced artifact, read from a `theorem-artifact` data part. */
export type TheoremArtifact = {
  partId: string
  artifactId: string
  revision: string
  kind: string
  rendererId: string
  contractVersion: string
  lifecycle: string
  patchSequence: number
  title: string
  content: string
  language: string | undefined
  fallbackText: string
  payloadRef: string | undefined
  runId: string | undefined
  sourceTool: string | undefined
}

export const ARTIFACT_PART = 'theorem-artifact'

type Json = Record<string, unknown>

function object(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Live run events carry the whole part as `data`; history carries the stored
 * part payload. Accept either and return the artifact part itself.
 */
export function readArtifact(data: unknown): TheoremArtifact | undefined {
  const outer = object(data)
  const part = text(outer.artifactId) ? outer : object(outer.payload)
  const artifactId = text(part.artifactId)
  if (!artifactId) return undefined
  const payload = object(part.payload)
  const title =
    text(payload.title) ?? text(part.fallbackText) ?? 'Untitled artifact'
  return {
    partId: text(part.partId) ?? artifactId,
    artifactId,
    revision: text(part.artifactRevision) ?? artifactId,
    kind: text(part.artifactKind) ?? 'unknown',
    rendererId: text(part.rendererId) ?? 'unknown',
    contractVersion: text(part.contractVersion) ?? 'unknown',
    lifecycle: text(part.lifecycle) ?? 'ready',
    patchSequence:
      typeof part.patchSequence === 'number' ? part.patchSequence : 0,
    title,
    content: text(payload.content) ?? '',
    language: text(payload.language),
    fallbackText: text(part.fallbackText) ?? title,
    payloadRef: text(part.payloadRef),
    runId: text(part.runId),
    sourceTool: text(part.sourceTool),
  }
}

/** Every artifact on the selected branch, each with its revisions in patch order. */
export function useThreadArtifacts(): ReadonlyMap<
  string,
  readonly TheoremArtifact[]
> {
  const messages = useAuiState((s) => s.thread.messages)
  return useMemo(() => {
    const byId = new Map<string, TheoremArtifact[]>()
    for (const message of messages) {
      if (message.role !== 'assistant') continue
      for (const part of message.content) {
        if (part.type !== 'data' || part.name !== ARTIFACT_PART) continue
        const artifact = readArtifact(part.data)
        if (!artifact) continue
        const versions = byId.get(artifact.artifactId) ?? []
        if (!versions.some((v) => v.revision === artifact.revision))
          versions.push(artifact)
        byId.set(artifact.artifactId, versions)
      }
    }
    for (const versions of byId.values())
      versions.sort((a, b) => a.patchSequence - b.patchSequence)
    return byId
  }, [messages])
}

const EXTENSIONS: Record<string, string> = {
  typescript: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  jsx: 'jsx',
  python: 'py',
  rust: 'rs',
  go: 'go',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  ruby: 'rb',
  shell: 'sh',
  bash: 'sh',
  sql: 'sql',
  html: 'html',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  markdown: 'md',
}

/** A short label for the artifact kind, used on cards and the panel header. */
export function kindLabel(artifact: TheoremArtifact): string {
  switch (artifact.kind) {
    case 'document':
      return 'Document'
    case 'code':
      return artifact.language ? `Code · ${artifact.language}` : 'Code'
    case 'diagram':
      return 'Diagram'
    default:
      return artifact.kind
  }
}

/** Download file name for an artifact revision. */
export function fileNameFor(artifact: TheoremArtifact): string {
  const base =
    artifact.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artifact'
  if (artifact.kind === 'document') return `${base}.md`
  if (artifact.kind === 'diagram') return `${base}.mmd`
  const ext = artifact.language
    ? EXTENSIONS[artifact.language.toLowerCase()]
    : undefined
  return `${base}.${ext ?? artifact.language ?? 'txt'}`
}
