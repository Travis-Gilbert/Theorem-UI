import { createFileRoute } from '@tanstack/react-router'

// One note, by its Theorem document id; ModeView shows it in Notes mode.
export const Route = createFileRoute('/_chat/notes/$documentId')({
  component: () => null,
})
