// SOURCING: @tanstack/react-router redirect (settings opens on its first page)
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/observe' })
  },
})
