// SOURCING: hand-rolled. One destination alone on paper, in flow, for a visual check.
import { ExperienceProvider } from '@/experience/experience'
import { Possibilities } from '@/possibilities/possibilities'

export default function PossibilitiesStory() {
  return (
    <ExperienceProvider appUrl="/story/demo-fixture" mode="flow" destination="possibilities">
      <main className="mx-auto max-w-5xl p-6">
        <div className="surface-paper sheet">
          <Possibilities canTry />
        </div>
      </main>
    </ExperienceProvider>
  )
}
