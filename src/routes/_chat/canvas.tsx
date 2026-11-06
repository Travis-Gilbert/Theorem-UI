import { createFileRoute } from '@tanstack/react-router'

/** `?program` is the node id of the standing program open on the canvas. */
export const Route = createFileRoute('/_chat/canvas')({
  validateSearch: (search: Record<string, unknown>): { program?: string } =>
    typeof search.program === 'string' ? { program: search.program } : {},
  component: () => null,
})
