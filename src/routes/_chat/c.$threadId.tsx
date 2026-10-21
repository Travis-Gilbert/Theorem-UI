import { createFileRoute } from '@tanstack/react-router'

// An existing conversation; the _chat layout reads the thread id from the URL.
export const Route = createFileRoute('/_chat/c/$threadId')({
  component: () => null,
})
