import { createFileRoute, redirect } from '@tanstack/react-router'
import { useShell } from '@/components/shell/shell-state'

// The Vault was a mode of its own; its files are now the navigator's, beside
// the conversation, so an old link shows them there.
export const Route = createFileRoute('/_chat/vault')({
  beforeLoad: () => {
    useShell.getState().setPanelOpen('chat', true)
    useShell.getState().setFilesShown(true)
    throw redirect({ to: '/' })
  },
})
