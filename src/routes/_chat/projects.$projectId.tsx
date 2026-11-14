import { createFileRoute } from '@tanstack/react-router'
import { projectSearch } from '@/lib/theorem/project-views'

// A project's home; the _chat layout keeps the shell and the sidebar, and the
// chat mode's view shows the project in place of a conversation. `?view` is
// the tab and `?lens` the graph's lens: both are what is shown, not state.
export const Route = createFileRoute('/_chat/projects/$projectId')({
  validateSearch: projectSearch,
  component: () => null,
})
