// SOURCING: the spec's Inbox (section 7): durable product data the client reads, not a list it assembles from notifications
import { router } from 'expo-router'
import { Button } from '@/ui/button'
import { Screen } from '@/ui/screen'
import { Unavailable } from '@/ui/unavailable'

export default function InboxScreen() {
  return (
    <Screen scroll>
      <Unavailable
        title="The inbox is not available yet"
        reason="Theorem does not publish a durable inbox yet, so this app has nothing authoritative to show here. It will not assemble one from notifications or guesses. Questions and approvals from a run appear in that conversation in Chat."
      >
        <Button label="Open Chat" onPress={() => router.navigate('/chat')} />
      </Unavailable>
    </Screen>
  )
}
