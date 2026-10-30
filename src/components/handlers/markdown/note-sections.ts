// SOURCING: mdast-util-heading-range (a heading's section, for `#Heading` and
// `#A#B`) and unist-util-visit (the block a `^id` marks) over the workspace
// parser's mdast (parseTree, with its source offsets); @tanstack/react-query
// for a note's text read once and fetched again when the note changes.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Nodes, RootContent } from 'mdast'
import { headingRange } from 'mdast-util-heading-range'
import { toString } from 'mdast-util-to-string'
import { useEffect } from 'react'
import { EXIT, visit } from 'unist-util-visit'
import { parseTree } from '#/server/desktop/workspace/markdown'
import type { WorkspaceClient } from '@/lib/workspace/types'

/** Obsidian's heading match: case and spacing aside. */
const normalize = (text: string) =>
  text.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The Markdown of `#Heading`: the heading and what follows it, up to the next
 * heading as high. `A#B` is the heading B within A's section. Null when the
 * note has no such heading.
 */
export function headingSection(text: string, heading: string): string | null {
  const parts = heading.split('#').map(normalize).filter(Boolean)
  if (!parts.length) return null
  let children: Array<RootContent> = parseTree(text).children
  let start = 0
  let end = text.length
  for (const part of parts) {
    const found: Array<Array<RootContent>> = []
    headingRange(
      { type: 'root', children },
      (value) => normalize(value) === part,
      (head, nodes, next) => {
        start = head.position?.start.offset ?? start
        end = next?.position?.start.offset ?? end
        found.push(nodes)
      },
    )
    const section = found[0]
    if (!section) return null
    children = section
  }
  return text.slice(start, end).trimEnd()
}

/**
 * The Markdown of the block `^id` marks: the paragraph or list item it ends,
 * or, for an id on a line of its own, the block before it. The id itself is
 * left out, as Obsidian hides it. Null when no block has that id.
 */
export function blockSection(text: string, id: string): string | null {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return null
  const marker = new RegExp(`(?:^|[ \\t])\\^${id}[ \\t]*$`, 'm')
  let found: Nodes | undefined
  visit(parseTree(text), 'paragraph', (node, index, parent) => {
    const content = toString(node)
    if (!marker.test(content)) return
    if (content.trim() === `^${id}` && parent && index)
      found = parent.children[index - 1]
    else found = parent?.type === 'listItem' ? parent : node
    return EXIT
  })
  const start = found?.position?.start.offset
  const end = found?.position?.end.offset
  if (start === undefined || end === undefined) return null
  return text.slice(start, end).replace(marker, '').trimEnd()
}

/** The part of a note a `#heading` or `#^block` subpath names, or null. */
export function noteSection(
  text: string,
  { heading, block }: { heading?: string; block?: string },
): string | null {
  if (block) return blockSection(text, block)
  if (heading) return headingSection(text, heading)
  return null
}

/**
 * A note's text for views that only read it (an embedded section, a link's
 * headings), fetched again when the note changes. Null `path` reads nothing.
 */
export function useNoteText(client: WorkspaceClient, path: string | null) {
  const queryClient = useQueryClient()
  const id = client.workspace.id
  useEffect(() => {
    if (path === null) return
    return client.subscribe((event) => {
      if (
        event.type === 'resync' ||
        ((event.type === 'changed' || event.type === 'created') &&
          event.entry.path === path)
      )
        void queryClient.invalidateQueries({
          queryKey: ['desktop', 'workspace', id, 'file', path, 'read'],
        })
    })
  }, [client, id, path, queryClient])
  return useQuery({
    queryKey: ['desktop', 'workspace', id, 'file', path, 'read'],
    queryFn: async () => (await client.readText(path!)).text,
    enabled: path !== null,
    staleTime: Infinity,
    retry: false,
  })
}
