// SOURCING: loro-crdt (LoroDoc, LoroTree, LoroText.update), the canonical state Theorem Documents v2 stores
//
// A note's canonical body is a full Loro snapshot in the layout Theorem's own
// promote path writes (one_paragraph_session in theorem-doc-store): a "blocks"
// tree with a root and one child whose attrs say kind=paragraph and whose
// "text:<id>" holds the whole Markdown. Revisions import the previous snapshot
// and update that text, so the document keeps its Loro history.
import { LoroDoc } from 'loro-crdt/base64'
import type { TreeID } from 'loro-crdt/base64'

const BLOCKS = 'blocks'
const textKey = (block: TreeID) => `text:${block}`
const attrsKey = (block: TreeID) => `attrs:${block}`

/** The one block that holds a note's Markdown, or undefined for any other layout. */
function noteBlock(doc: LoroDoc): TreeID | undefined {
  // A block is content when it has text or attributes, as theorem-doc-session counts it.
  const content = doc
    .getTree(BLOCKS)
    .getNodes()
    .map((node) => node.id)
    .filter(
      (id) =>
        doc.getText(textKey(id)).length > 0 ||
        doc.getMap(attrsKey(id)).size > 0,
    )
  const [block] = content
  return content.length === 1 &&
    block !== undefined &&
    doc.getMap(attrsKey(block)).get('kind') === 'paragraph'
    ? block
    : undefined
}

/** A new note's canonical snapshot. */
export function encodeNote(markdown: string): Uint8Array {
  const doc = new LoroDoc()
  const tree = doc.getTree(BLOCKS)
  const block = tree.createNode().createNode()
  doc.getMap(attrsKey(block.id)).set('kind', 'paragraph')
  doc.getText(textKey(block.id)).insert(0, markdown)
  doc.commit()
  return doc.export({ mode: 'snapshot' })
}

/** Whether a canonical snapshot is a note this editor can revise without losing structure. */
export function isEditableNote(canonical: Uint8Array): boolean {
  return noteBlock(LoroDoc.fromSnapshot(canonical)) !== undefined
}

/** The next canonical snapshot: the previous one with its Markdown replaced by a minimal diff. */
export function reviseNote(
  canonical: Uint8Array,
  markdown: string,
): Uint8Array {
  const doc = LoroDoc.fromSnapshot(canonical)
  const block = noteBlock(doc)
  if (!block) throw new Error('This document is not a one-paragraph note')
  doc.getText(textKey(block)).update(markdown)
  doc.commit()
  return doc.export({ mode: 'snapshot' })
}

/**
 * Three-way merge after a stale save: local edits made on `base` and the
 * newer `remote` revision both descend from `base`, so Loro merges them
 * instead of one overwriting the other. Undefined when remote is not a note.
 */
export function mergeNote(
  base: Uint8Array,
  markdown: string,
  remote: Uint8Array,
): { canonical: Uint8Array; markdown: string } | undefined {
  const doc = LoroDoc.fromSnapshot(base)
  const block = noteBlock(doc)
  if (!block) return undefined
  doc.getText(textKey(block)).update(markdown)
  doc.commit()
  doc.import(remote)
  const merged = noteBlock(doc)
  if (!merged) return undefined
  return {
    canonical: doc.export({ mode: 'snapshot' }),
    markdown: doc.getText(textKey(merged)).toString(),
  }
}

/** The Markdown a note snapshot holds. */
export function noteMarkdown(canonical: Uint8Array): string | undefined {
  const doc = LoroDoc.fromSnapshot(canonical)
  const block = noteBlock(doc)
  return block && doc.getText(textKey(block)).toString()
}

/** Theorem's content digest: sha256 over the exact bytes. */
export async function contentDigest(bytes: Uint8Array): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  )
  return `sha256:${Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
