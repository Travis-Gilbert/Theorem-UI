// SOURCING: @tanstack/react-router file routes (settings is its own layout beside the chat shell, as Twenty's settings replace the app's panel), the model preferences sync
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/components/settings/settings-frame'
import { PreferencesSync } from '@/lib/theorem/models'

export const Route = createFileRoute('/settings')({
  // Settings read the person's Theorem through the browser client.
  ssr: false,
  component: () => (
    <SettingsLayout>
      <PreferencesSync />
      <Outlet />
    </SettingsLayout>
  ),
})
