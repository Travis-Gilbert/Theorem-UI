// SOURCING: @tanstack/react-router file routes (a layout route owns the settings shell; each page is a child route)
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SettingsShell } from '@/components/settings/settings-shell'

export const Route = createFileRoute('/settings')({
  // Settings read the signed-in session through this origin, in the browser.
  ssr: false,
  head: () => ({ meta: [{ title: 'Settings · Theorem' }] }),
  component: () => (
    <SettingsShell>
      <Outlet />
    </SettingsShell>
  ),
})
