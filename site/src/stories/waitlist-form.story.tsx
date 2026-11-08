// SOURCING: hand-rolled. A story is a plain render of WaitlistForm in one forced state; nothing upstream models it.
import { WaitlistForm } from '@/components/waitlist-form'
import type { WaitlistState } from '@/components/waitlist-form'

const states: WaitlistState[] = [
  'idle',
  'focused',
  'sending',
  'joined',
  'already',
  'invalid',
  'failed',
]

export default function WaitlistFormStory() {
  const asked = new URLSearchParams(location.search).get(
    'state',
  ) as WaitlistState | null
  const state = asked && states.includes(asked) ? asked : 'idle'
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <WaitlistForm
        source="story"
        forceState={state}
        className="w-full max-w-md"
      />
    </main>
  )
}
