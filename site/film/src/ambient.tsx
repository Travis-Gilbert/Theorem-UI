// SOURCING: Remotion (AbsoluteFill, interpolate) over the same Life field as the film. The loop closes by crossfading the run's end into its start, since a Life run does not come back to where it began.
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { Life } from './life'
import { BRASS, PAPER, SLATE, TITLE, landscape } from './theme'
import type { Layout } from './theme'

export const AMBIENT_FRAMES = 480
const BLEND = 45

export function Ambient({ layout }: { layout: Layout } & Record<string, unknown>) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const desktop = landscape(layout)
  const cell = desktop ? 20 : 16
  const fresh = interpolate(frame, [AMBIENT_FRAMES - BLEND, AMBIENT_FRAMES], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const field = (opacity: number, offset?: number) => (
    <Life seed={1968} cell={cell} color={PAPER} fade={BRASS} opacity={opacity} offset={offset} />
  )
  return (
    <AbsoluteFill style={{ background: SLATE }}>
      {/* The run starts AMBIENT_FRAMES in, so what fades in at the end is the very frame the loop opens on. */}
      {field(0.62 * (1 - fresh), AMBIENT_FRAMES)}
      {fresh > 0 && field(0.62 * fresh)}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: TITLE, fontSize: width * (desktop ? 0.16 : 0.24), lineHeight: 1, color: PAPER, background: SLATE, padding: `${width * 0.012}px ${width * 0.03}px` }}>
          THEOREM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
