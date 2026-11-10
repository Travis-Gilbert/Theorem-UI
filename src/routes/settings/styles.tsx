// SOURCING: TanStack Router file route, as settings/keys and settings/ai; the page itself lives in components/settings/styles
import { createFileRoute } from '@tanstack/react-router'
import { ResponseStylesPage } from '@/components/settings/styles/response-styles-page'

export const Route = createFileRoute('/settings/styles')({
  component: ResponseStylesPage,
})
