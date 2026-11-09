// SOURCING: none: committed OpenUI programs for the theorem-artifacts stories,
// one per component, the GPU composite and the two ways a program fails to
// render. Plain data, so the story list can read it without components.
import { EXAMPLES, GPU_WORKLOAD } from '@/components/artifacts/openui/examples'

export type ArtifactStory = {
  id: string
  title: string
  program: string
  /** The library version the program was written for, when it isn't this build's. */
  version?: string
}

const kebab = (name: string) =>
  name.replace(/[a-z](?=[A-Z])/g, '$&-').toLowerCase()

export const ARTIFACT_STORIES: readonly ArtifactStory[] = [
  {
    id: 'artifact-gpu-workload',
    title: 'CPU or GPU: when the move pays off',
    program: GPU_WORKLOAD,
  },
  ...Object.entries(EXAMPLES).map(([name, program]) => ({
    id: `artifact-${kebab(name)}`,
    title: name,
    program,
  })),
  {
    id: 'artifact-unreadable',
    title: 'A program cut off partway',
    program: 'root = Stack([a])\na = Stat("Speed", ',
  },
  {
    id: 'artifact-version-mismatch',
    title: 'A program for another library version',
    program: EXAMPLES.Stat,
    version: '2',
  },
]
