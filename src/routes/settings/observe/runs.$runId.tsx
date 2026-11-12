// SOURCING: @tanstack/react-router file route for one turn's trace
import { createFileRoute } from '@tanstack/react-router'
import { RunPage } from '@/components/settings/observe/run-page'

export const Route = createFileRoute('/settings/observe/runs/$runId')({
  component: Run,
})

function Run() {
  const { runId } = Route.useParams()
  // Keyed so one turn's page never shows another's record while it loads.
  return <RunPage key={runId} runId={runId} />
}
