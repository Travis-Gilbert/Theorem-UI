// SOURCING: the spec's Platinum workspace view (section 11); Theorem has no pairing or application-surface API for it yet. Computers saved on this device come from the theorem-session module.
import { router } from 'expo-router'
import { Button } from '@/ui/button'
import { Screen } from '@/ui/screen'
import { Unavailable } from '@/ui/unavailable'

export default function PlatinumScreen() {
  return (
    <Screen scroll>
      <Unavailable
        title="No paired Platinum workspaces"
        reason="Pairing a computer and viewing its Platinum workspace need a host pairing service and an application-surface contract that Theorem does not provide yet. This screen will show host availability and who holds control once they exist; it does not show a simulated desktop."
      />
      <Unavailable
        title="Claude Code and Codex on your computers"
        reason="Talk to Claude Code or Codex running on a computer of yours from Chat. Until Theorem can pair a computer, this uses a direct SSH connection that you set up on this device."
      >
        <Button label="Add a computer" onPress={() => router.push('/computer')} />
      </Unavailable>
      <Unavailable
        title="Hosted agents work without a computer"
        reason="Chat uses Theorem's hosted agents directly after sign-in. A paired computer is only needed for agents or workspaces that run on it."
      />
    </Screen>
  )
}
