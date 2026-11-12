// SOURCING: @tanstack/react-router file route for the settings' Observe page
import { createFileRoute } from '@tanstack/react-router'
import { ObservePage } from '@/components/settings/observe/observe-page'

export const Route = createFileRoute('/settings/observe/')({
  component: ObservePage,
})
