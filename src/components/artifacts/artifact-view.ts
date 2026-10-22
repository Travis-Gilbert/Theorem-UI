// SOURCING: zustand (view state for artifact panels; artifact content stays in thread messages, panel placement in the dockview layout)
import { create } from 'zustand'

/** The desktop dock, which hosts each open artifact as its own panel. */
export type ArtifactDock = {
  open: (artifactId: string) => void
  expand: (artifactId: string) => void
  close: (artifactId: string) => void
}

type ArtifactView = {
  /** Focused artifact: the active artifact tab on desktop, the full-screen view on phones. */
  openId: string | undefined
  /** Pinned revision per artifact; an absent entry follows the latest revision as it arrives. */
  revisions: Readonly<Record<string, string>>
  /** Set while the desktop dock is mounted; phones show `openId` alone. */
  dock: ArtifactDock | undefined
  open: (artifactId: string, revision?: string) => void
  expand: (artifactId: string) => void
  select: (artifactId: string, revision: string | undefined) => void
  close: (artifactId: string) => void
  /** Records that the dock focused an artifact panel. */
  focused: (artifactId: string) => void
  /** Records that an artifact panel left the dock. */
  closed: (artifactId: string) => void
  reset: () => void
}

function pin(
  revisions: Readonly<Record<string, string>>,
  artifactId: string,
  revision: string | undefined,
) {
  const { [artifactId]: _, ...rest } = revisions
  return revision === undefined ? rest : { ...rest, [artifactId]: revision }
}

export const useArtifactView = create<ArtifactView>()((set, get) => ({
  openId: undefined,
  revisions: {},
  dock: undefined,
  open: (artifactId, revision) => {
    set((s) => ({
      openId: artifactId,
      revisions: pin(s.revisions, artifactId, revision),
    }))
    get().dock?.open(artifactId)
  },
  expand: (artifactId) => {
    set({ openId: artifactId })
    get().dock?.expand(artifactId)
  },
  select: (artifactId, revision) =>
    set((s) => ({ revisions: pin(s.revisions, artifactId, revision) })),
  close: (artifactId) => {
    const { dock, closed } = get()
    if (dock) dock.close(artifactId)
    else closed(artifactId)
  },
  focused: (artifactId) => set({ openId: artifactId }),
  closed: (artifactId) =>
    set((s) => ({
      openId: s.openId === artifactId ? undefined : s.openId,
      revisions: pin(s.revisions, artifactId, undefined),
    })),
  reset: () => set({ openId: undefined, revisions: {} }),
}))
