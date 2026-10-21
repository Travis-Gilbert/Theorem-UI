// SOURCING: zustand (view state for the artifact panel; artifact content stays in thread messages)
import { create } from 'zustand'

type ArtifactView = {
  /** Artifact shown in the panel. */
  openId: string | undefined
  /** Pinned revision; undefined follows the latest revision as it arrives. */
  revision: string | undefined
  expanded: boolean
  open: (artifactId: string, revision?: string) => void
  select: (revision: string | undefined) => void
  setExpanded: (expanded: boolean) => void
  close: () => void
}

export const useArtifactView = create<ArtifactView>()((set) => ({
  openId: undefined,
  revision: undefined,
  expanded: false,
  open: (openId, revision) => set({ openId, revision }),
  select: (revision) => set({ revision }),
  setExpanded: (expanded) => set({ expanded }),
  close: () => set({ openId: undefined, revision: undefined, expanded: false }),
}))
