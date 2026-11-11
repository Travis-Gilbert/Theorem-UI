// SOURCING: components/kit/kit-stage.tsx for the layer (fixed over the whole shell, taking pointer events only in the figure itself, below popups) and for the status node a screen reader gets; lib/kit/store for the run's liveness and the agent's authored expression, which both figures read. The visor plate is this app's reading of the reference robot's dark screen; whether it is there is the person's setting (./look).
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { THEO } from '@/lib/face/identity'
import { theFace, useFaceStage } from '@/lib/face/store'
import { useKit } from '@/lib/kit/store'
import { FaceDriver, VISOR_PX } from './driver'
import { eyeColour, useFaceHue, useFaceLook } from './look'

const VISOR_HEIGHT = (VISOR_PX * THEO.height) / THEO.width
/** Three arcs a side: the left ones, then the right. */
const WAVES = ['l0', 'l1', 'l2', 'r0', 'r1', 'r2'] as const

/**
 * Theo on the page: the agent's face. It rests in the gutter of the live
 * reply, or by the composer when there is none, grows when it performs, and
 * sleeps when nothing has happened for a while. The person can tap it, carry
 * it, stroke it, and double-tap to send it home; the agent moves it through
 * the `face.*` operations its turns declare.
 */
export function FaceStage() {
  const holder = useRef<HTMLDivElement | null>(null)
  const plate = useRef<HTMLDivElement | null>(null)
  const screen = useRef<HTMLDivElement | null>(null)
  const mark = useRef<HTMLDivElement | null>(null)
  const waves = useRef<SVGSVGElement | null>(null)
  const driving = useRef<FaceDriver | undefined>(undefined)
  const look = useFaceLook()
  const hue = useFaceHue()
  const [words, setWords] = useState('at rest')
  const liveness = useKit((state) => state.liveness)
  const expression = useKit((state) => state.expression)

  useEffect(() => {
    if (
      !holder.current ||
      !plate.current ||
      !screen.current ||
      !mark.current ||
      !waves.current
    )
      return
    const driver = new FaceDriver(
      theFace(),
      holder.current,
      plate.current,
      screen.current,
      mark.current,
      [...waves.current.querySelectorAll('path')],
      (state) => {
        if (state.words !== undefined) setWords(state.words)
        if (state.painter) useFaceStage.setState({ painter: state.painter })
      },
    )
    driver.start()
    driving.current = driver
    useFaceStage.setState({ mounted: true })
    return () => {
      driver.destroy()
      driving.current = undefined
      useFaceStage.setState({ mounted: false, painter: undefined })
    }
  }, [])

  useEffect(() => {
    if (driving.current) driving.current.ink = look.ink
  }, [look.ink])
  useEffect(() => {
    theFace().setLiveness(liveness)
  }, [liveness])
  // The theme's hue first: an authored hue is a turn from it.
  useEffect(() => {
    theFace().tint(hue)
    theFace().express(expression)
  }, [expression, hue])

  return (
    <div
      data-slot="face-stage"
      data-press="off"
      className="pointer-events-none fixed inset-0 z-[44] overflow-hidden"
    >
      {/* What Theo points at, marked in its own colour. The driver places it. */}
      <div
        ref={mark}
        data-slot="face-point"
        aria-hidden
        className="face-point absolute top-0 left-0"
        style={{ '--face-point': eyeColour(hue) } as CSSProperties}
      />
      <div
        ref={holder}
        role="button"
        tabIndex={0}
        aria-label="Theo, the agent’s face. Press to poke it; drag to carry it; Escape sends it home."
        data-slot="face"
        data-doing={words}
        className="focus-visible:outline-focus pointer-events-auto absolute top-0 left-0 cursor-grab touch-none rounded-[22px] outline-offset-4 select-none focus-visible:outline-2 active:cursor-grabbing"
        style={{
          width: VISOR_PX,
          height: VISOR_HEIGHT,
          transform: 'translate3d(-400px, -400px, 0)',
          willChange: 'transform',
        }}
      >
        <div
          ref={plate}
          data-visor={look.visor ? 'on' : 'off'}
          className="face-plate size-full"
          style={{ willChange: 'transform' }}
        >
          <div ref={screen} className="size-full" />
        </div>
        {/* The arcs that leave Theo's sides while it sounds. They are outside the visor, which clips its matter; the driver draws them. */}
        <svg
          ref={waves}
          data-slot="face-waves"
          aria-hidden
          viewBox={`0 0 ${VISOR_PX} ${VISOR_HEIGHT}`}
          className="face-waves pointer-events-none absolute inset-0 size-full overflow-visible"
          style={{ '--face-wave': eyeColour(hue) } as CSSProperties}
        >
          {WAVES.map((wave) => (
            <path key={wave} style={{ opacity: 0 }} />
          ))}
        </svg>
      </div>
      <span role="status" className="sr-only">
        Theo is {words}
      </span>
    </div>
  )
}
