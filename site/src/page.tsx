// SOURCING: the three destinations composed: ExperienceProvider (reveal gate and bridge) around Scene. Nothing upstream to adopt.
import { ExperienceProvider } from '@/experience/experience'
import type { FilmAssets } from '@/experience/experience'
import { liveUrl } from '@/lib/live'
import { Scene, useDestination, useSceneMode } from '@/scene/scene'

export interface PageProps {
  /** Overrides for stories: which app to frame (null for none), which film to play. */
  appUrl?: string | null
  assets?: FilmAssets
}

export function Page({ appUrl = liveUrl, assets }: PageProps) {
  const mode = useSceneMode()
  const destination = useDestination()
  return (
    <ExperienceProvider
      appUrl={appUrl ?? undefined}
      assets={assets}
      mode={mode}
      destination={destination}
    >
      <Scene />
    </ExperienceProvider>
  )
}
