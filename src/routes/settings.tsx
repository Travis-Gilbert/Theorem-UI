// SOURCING: @tanstack/react-router file routes (settings is its own layout beside the chat shell, as Twenty's settings replace the app's panel), the ⌘K palette and the model preferences sync, mounted here as in the chat layout
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/components/settings/settings-frame'
import { CommandPalette } from '@/components/shell/command-palette'
import { PreferencesSync } from '@/lib/theorem/models'

export const Route = createFileRoute('/settings')({
  // Settings read the person's Theorem through the browser client.
  ssr: false,
  component: () => (
    <SettingsLayout>
      <CommandPalette />
      <PreferencesSync />
      <Outlet />
    </SettingsLayout>
  ),
})
