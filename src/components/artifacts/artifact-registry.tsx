// SOURCING: none — the UI's artifact contributions and mount table over the
// projected contribution contract (lib/artifacts/contributions, a projection
// of theorem-surface-contracts' resolve). Shells ask for a distance; this
// module answers which mounted renderer shows it, so no shell branches on a
// kind. Adding a kind is a contribution and a mount entry here.
import type { FC } from 'react'
import {
  contribution,
  live,
  presentation,
  resolve,
  validateAll,
} from '@/lib/artifacts/contributions'
import type {
  ArtifactContribution,
  ArtifactSubject,
  Distance,
  Representation,
} from '@/lib/artifacts/contributions'
import { resolvedTheme } from '@/lib/blocks/sandbox/theme'
import { observableSource } from '@/lib/notebooks/observable-document'
import { appDocumentFor } from '@/lib/theorem/apps'
import { fileNameFor } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'

export type RendererProps = {
  artifact: TheoremArtifact
  /** The artifact's newest revision in this thread; older ones show pinned. */
  latest: boolean
}

/** What this build of the UI contributes, in the manifest's wire shape. */
export const UI_CONTRIBUTIONS: ReadonlyArray<ArtifactContribution> = [
  // Notebooks are claimed by their form, ahead of any kind their part also
  // names, and by the contract's kind, so a payload this build cannot read
  // still reaches the renderer that says why.
  contribution('theorem.notebook.observable', 'Observable notebook', {
    provider: 'theorem-ui',
    kinds: ['observable'],
    schemas: ['theorem.notebook.observable'],
    presentations: [
      presentation('artifact_native', 'theorem-observable', [
        'preview',
        'thing',
        'interactive',
      ]),
    ],
    locators: ['notebook_cell', 'entity'],
    followsTheme: true,
  }),
  contribution('theorem.notebook.marimo', 'marimo notebook', {
    provider: 'theorem-ui',
    kinds: ['marimo'],
    schemas: ['theorem.notebook.marimo'],
    presentations: [
      presentation('artifact_native', 'theorem-marimo', [
        'preview',
        'thing',
        'interactive',
      ]),
    ],
    locators: ['notebook_cell', 'entity'],
    followsTheme: true,
  }),
  contribution('theorem.document', 'Document', {
    provider: 'theorem-ui',
    kinds: ['document'],
    media: ['text/markdown'],
    presentations: [
      presentation('artifact_native', 'theorem-document.excerpt', ['preview']),
      presentation('artifact_native', 'theorem-document', [
        'thing',
        'interactive',
      ]),
    ],
    locators: ['text_range'],
    followsTheme: true,
  }),
  contribution('theorem.code', 'Code', {
    provider: 'theorem-ui',
    kinds: ['code'],
    presentations: [
      presentation('artifact_native', 'theorem-code.excerpt', ['preview']),
      presentation('artifact_native', 'theorem-code', ['thing', 'interactive']),
    ],
    locators: ['code_range'],
    followsTheme: true,
  }),
  contribution('theorem.diagram', 'Diagram', {
    provider: 'theorem-ui',
    kinds: ['diagram'],
    media: ['text/vnd.mermaid'],
    presentations: [
      presentation('artifact_native', 'theorem-diagram', [
        'preview',
        'thing',
        'interactive',
      ]),
    ],
    followsTheme: true,
  }),
  contribution('theorem.app', 'App', {
    provider: 'theorem-ui',
    kinds: ['app'],
    media: ['text/html'],
    schemas: ['theorem.app'],
    presentations: [
      presentation('artifact_native', 'theorem-app.preview', [
        'landmark',
        'preview',
      ]),
      live(
        presentation('artifact_native', 'theorem-app', [
          'thing',
          'interactive',
        ]),
      ),
    ],
    locators: ['entity', 'table_rows'],
  }),
]

const invalid = validateAll(UI_CONTRIBUTIONS)
if (invalid)
  throw new Error(
    `Artifact contribution ${invalid.id} is invalid: ${invalid.code}`,
  )

const MEDIA: Record<string, string> = {
  html: 'text/html',
  markdown: 'text/markdown',
  mermaid: 'text/vnd.mermaid',
}

/**
 * The subject an artifact part presents to the contributions. A notebook is
 * known by its form. Otherwise a kind some contribution names is the whole
 * subject: its language says what its source is written in, not what it is.
 * Only a kind nothing names is recognized by its language.
 */
export function subjectOf(
  artifact: TheoremArtifact,
  contributions: ReadonlyArray<ArtifactContribution> = UI_CONTRIBUTIONS,
): ArtifactSubject {
  const { kind } = artifact
  if (artifact.notebook)
    return { kind, schema: `theorem.notebook.${artifact.notebook.form}` }
  if (contributions.some((c) => c.matches.objectKinds.includes(kind)))
    return { kind }
  const language = artifact.language?.toLowerCase()
  return {
    kind,
    ...(language && MEDIA[language] && { mediaType: MEDIA[language] }),
  }
}

let mounted: Readonly<Record<string, FC<RendererProps>>> = {}

/**
 * Mounts the renderers this build ships. Called once, by the module that
 * defines them (artifact-renderers), so availability is what actually loaded.
 */
export function mountRenderers(table: Record<string, FC<RendererProps>>) {
  mounted = { ...mounted, ...table }
}

export function rendererFor(
  representation: Representation,
): FC<RendererProps> | undefined {
  return representation.renderer ? mounted[representation.renderer] : undefined
}

export function representationOf(
  artifact: TheoremArtifact,
  distance: Distance,
  contributions: ReadonlyArray<ArtifactContribution> = UI_CONTRIBUTIONS,
): Representation {
  return resolve(
    subjectOf(artifact, contributions),
    distance,
    contributions,
    (renderer) =>
      renderer in mounted
        ? { mounted: true }
        : { mounted: false, reason: `This build has no ${renderer} renderer` },
  )
}

export type ArtifactSource = {
  /** Names the source in action labels: "App source", or "" for the text itself. */
  noun: string
  mediaType: string
  load: () => Promise<string>
}

const inline = (artifact: TheoremArtifact) => async () => artifact.content

/** Per contribution: what Copy and Download hand over for a revision. */
const SOURCES: Record<
  string,
  (artifact: TheoremArtifact, latest: boolean) => ArtifactSource
> = {
  'theorem.document': (artifact) => ({
    noun: '',
    mediaType: 'text/markdown',
    load: inline(artifact),
  }),
  'theorem.diagram': (artifact) => ({
    noun: '',
    mediaType: 'text/vnd.mermaid',
    load: inline(artifact),
  }),
  // A payload this build cannot read still hands over its content: the
  // publication as canonical JSON.
  'theorem.notebook.observable': (artifact) => {
    const { notebook } = artifact
    return notebook?.form === 'observable'
      ? {
          noun: 'Notebook',
          mediaType: 'text/html',
          load: async () => observableSource(notebook, resolvedTheme()),
        }
      : { noun: 'Notebook', mediaType: 'application/json', load: inline(artifact) }
  },
  'theorem.notebook.marimo': (artifact) => ({
    noun: 'Notebook source',
    mediaType: 'text/x-python',
    load: async () =>
      artifact.notebook?.form === 'marimo'
        ? artifact.notebook.source
        : artifact.content,
  }),
  'theorem.app': (artifact, latest) => ({
    noun: 'App source',
    mediaType: 'text/html',
    // The newest revision is the App as saved now, edits included; an older
    // one is exactly the source its message pinned.
    load:
      latest || !artifact.content
        ? async () => {
            if (!artifact.documentId)
              throw new Error('The App has no saved document reference.')
            return (await appDocumentFor(artifact.documentId).load()).html
          }
        : inline(artifact),
  }),
}

export function sourceOf(
  artifact: TheoremArtifact,
  latest: boolean,
): ArtifactSource {
  const id = representationOf(artifact, 'thing').contribution
  const adapter = id ? SOURCES[id] : undefined
  return (
    adapter?.(artifact, latest) ?? {
      noun: '',
      mediaType: 'text/plain',
      load: inline(artifact),
    }
  )
}

/** What Download names the revision: the extension follows the source's media type. */
export const fileNameOf = (artifact: TheoremArtifact, latest: boolean) =>
  fileNameFor(artifact, sourceOf(artifact, latest).mediaType)

/**
 * Whether showing the artifact at a distance holds a live session. A live
 * representation opens only when the person asks for it: Follow the Agent
 * never opens one, and the conversation offers it as Interact.
 */
export const isLive = (artifact: TheoremArtifact, distance: Distance) =>
  representationOf(artifact, distance).session === 'live'
