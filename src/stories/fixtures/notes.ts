// SOURCING: lib/theorem/note-canonical (a document's real canonical form), the embed format and Space record the app stores. Media are small committed files made with ffmpeg, so the viewers play real bytes.
import type { Theorem } from '@/lib/theorem/client'
import { embedFence } from '@/lib/theorem/embeds'
import type { EmbedRef } from '@/lib/theorem/embeds'
import { encodeNote } from '@/lib/theorem/note-canonical'
import { blockFor, noteHolding } from '@/lib/theorem/note-kinds'
import { titleOf } from '@/lib/theorem/notes'
import { uploadContentPath } from '@/lib/theorem/uploads'
import iconUrl from './media/app-icon.svg?url'
import clipUrl from './media/clip.mp4?url'
// Inlined: the dev server answers this one extension with the app's 404 page.
import paperUrl from './media/paper.pdf?inline'
import toneUrl from './media/tone.mp3?url'

export const uploadFixtures: Readonly<Record<string, { url: string; mime: string }>> = {
  'upload-paper': { url: paperUrl, mime: 'application/pdf' },
  'upload-tone': { url: toneUrl, mime: 'audio/mpeg' },
  'upload-clip': { url: clipUrl, mime: 'video/mp4' },
  'upload-icon': { url: iconUrl, mime: 'image/svg+xml' },
}

const file = (id: string, title: string): EmbedRef => ({
  kind: 'file',
  id,
  title,
  mime: uploadFixtures[id]?.mime,
})

const PDF = embedFence(file('upload-paper', 'Spaces and their notes.pdf'))
const AUDIO = embedFence(file('upload-tone', 'Reference tone.mp3'))
const VIDEO = embedFence(file('upload-clip', 'Walkthrough.mp4'))
const IMAGE = `![App icon](${uploadContentPath('upload-icon')})\n`
const LINK = embedFence({
  kind: 'link',
  id: 'https://note.example/articles/spaces',
  title: 'Article on note',
})
const NESTED_SPACE_ID = 'space:canvas:story-diagram'

/** One note holding every kind. */
const EVERYTHING = [
  '# A note holds many things',
  'Plain text with **emphasis**, and a [link](https://example.com).',
  '## Checklist',
  blockFor('checklist'),
  '## Table',
  blockFor('table'),
  '## Code',
  blockFor('code').replace('\n\n', '\nconst answer = 42\n'),
  '## JSON',
  blockFor('json'),
  '## Math',
  blockFor('math'),
  '## Diagram',
  blockFor('diagram'),
  '## Data',
  blockFor('data'),
  '## Image',
  IMAGE,
  '## Audio',
  AUDIO,
  '## Video',
  VIDEO,
  '## PDF',
  PDF,
  '## Link',
  LINK,
  '## Conversation',
  embedFence({ kind: 'thread', id: 'thread-app-gallery', title: 'App gallery layout' }),
  '## App or artifact',
  embedFence({ kind: 'artifact', id: 'artifact-gallery', title: 'Gallery prototype', threadId: 'thread-app-gallery' }),
  '## Canvas',
  embedFence({ kind: 'space', id: NESTED_SPACE_ID, title: 'Flow diagram' }),
  '## Another note',
  embedFence({ kind: 'document', id: 'doc-hello', title: 'Hello World!' }),
].join('\n\n')

export const documentFixtures: Readonly<Record<string, string>> = {
  'doc-everything': EVERYTHING,
  'doc-paper': noteHolding('Spaces and their notes.pdf', PDF),
  'doc-hello': 'Hello World!\n',
  'doc-track': `# Source track\n\nWhere this came from, and why it is here.\n\n## Recording\n\n${AUDIO}`,
  'doc-icon': noteHolding('App icon', IMAGE),
  'doc-link': LINK,
  'doc-video': noteHolding('Walkthrough.mp4', VIDEO),
  'doc-diagram': noteHolding('Save path', blockFor('diagram')),
  'doc-data': noteHolding('Runs', blockFor('data')),
  'doc-checks': noteHolding('Before shipping', blockFor('checklist')),
}

const base64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))

export function documentSnapshot(documentId: string, markdown: string, now: number) {
  const canonical = encodeNote(markdown)
  const revision = { position: 1, contentDigest: 'story' }
  return {
    schema: 'theorem-document/2',
    summary: {
      schema: 'theorem-document/2',
      documentId,
      documentKind: 'authored',
      title: titleOf(markdown),
      readOnly: false,
      revision,
      createdPosition: 1,
      updatedPosition: 1,
      projectionDigest: 'story',
      collectionIds: [],
      actors: [],
      origin: { kind: 'user', at: now },
    },
    canonical: {
      placement: 'inline',
      bytesBase64: base64(canonical),
      size: canonical.length,
      digest: 'story',
    },
    markdownProjection: markdown,
  }
}

const authorship: Theorem.PlacementAuthorship = {
  placed_by: { actor: 'user' },
  arranged: false,
}

const note = (
  id: string,
  documentId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  group?: string,
): Theorem.SpacePlacement => ({
  target: 'object',
  id,
  rect: { x, y, w, h },
  authorship,
  object: { kind: 'document', id: documentId },
  ...(group ? { group } : {}),
})

const line = (
  from: string,
  to: string,
  from_side: Theorem.SpaceSide,
  to_side: Theorem.SpaceSide,
): Theorem.SpaceConnection => ({
  id: `c-${from}-${to}`,
  from,
  to,
  from_side,
  to_side,
  to_end: 'arrow',
})

/** The canvas of the reference: its nodes in its places, in Theorem's vocabulary. */
export function canvasSpaceFixture(projectId: string): Theorem.SpaceRecord {
  return {
    schema: 'theorem.space/1',
    revision: 1,
    space: {
      role: 'project',
      format: 1,
      id: `space:project:${projectId}`,
      title: 'note canvas',
      project: { kind: 'project', id: projectId },
      groups: [
        {
          id: 'group-sources',
          rect: { x: 931, y: 452, w: 277, h: 209 },
          label: 'Reference',
        },
      ],
      placements: [
        note('p-paper', 'doc-paper', 158, 73, 339, 350),
        note('p-hello', 'doc-hello', 700, 227, 123, 49),
        note('p-track', 'doc-track', 894, 151, 350, 201),
        note('p-icon', 'doc-icon', 955, 512, 229, 125, 'group-sources'),
        note('p-link', 'doc-link', 648, 402, 170, 56),
        note('p-video', 'doc-video', 542, 616, 350, 196),
        {
          target: 'space',
          id: 'p-canvas',
          rect: { x: 201, y: 525, w: 263, h: 225 },
          authorship,
          space: NESTED_SPACE_ID,
          label: 'Flow diagram',
        },
        // Past the reference: what a card can also hold.
        note('p-diagram', 'doc-diagram', 540, 50, 300, 140),
        note('p-data', 'doc-data', 930, 690, 280, 122),
      ],
      connections: [
        line('p-paper', 'p-hello', 'right', 'left'),
        line('p-hello', 'p-track', 'right', 'left'),
        line('p-track', 'p-icon', 'bottom', 'top'),
        line('p-icon', 'p-video', 'left', 'right'),
        line('p-link', 'p-video', 'bottom', 'top'),
        line('p-video', 'p-canvas', 'left', 'right'),
        line('p-canvas', 'p-paper', 'top', 'bottom'),
      ],
    },
  }
}

export function nestedSpaceFixture(parent: string): Theorem.SpaceRecord {
  return {
    schema: 'theorem.space/1',
    revision: 1,
    space: {
      role: 'custom',
      format: 1,
      id: NESTED_SPACE_ID,
      title: 'Flow diagram',
      parent,
      placements: [
        note('n-hello', 'doc-hello', 0, 40, 200, 80),
        note('n-diagram', 'doc-diagram', 280, 0, 320, 200),
        note('n-data', 'doc-data', 280, 240, 320, 160),
      ],
      connections: [
        line('n-hello', 'n-diagram', 'right', 'left'),
        line('n-diagram', 'n-data', 'bottom', 'top'),
      ],
    },
  }
}
