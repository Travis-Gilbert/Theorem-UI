// SOURCING: components/kit/kit-stage.tsx for the layer (fixed over the whole shell, taking pointer events only in the figure itself, below popups) and for the status node a screen reader gets; lib/kit/store for the run's liveness and the agent's authored expression, which both figures read. The visor plate is this app's reading of the reference robot's dark screen.
import { useEffect, useRef, useState } from 'react'
import { THEO } from '@/lib/face/identity'
import { theFace, useFaceStage } from '@/lib/face/store'
import { useKit } from '@/lib/kit/store'
import { FaceDriver, VISOR_PX } from './driver'

const VISOR_HEIGHT = (VISOR_PX * THEO.height) / THEO.width

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
  const [words, setWords] = useState('at rest')
  const liveness = useKit((state) => state.liveness)
  const expression = useKit((state) => state.expression)

  useEffect(() => {
    if (!holder.current || !plate.current || !screen.current) return
    const driver = new FaceDriver(
      theFace(),
      holder.current,
      plate.current,
      screen.current,
      (state) => {
        if (state.words !== undefined) setWords(state.words)
        if (state.painter) useFaceStage.setState({ painter: state.painter })
      },
    )
    driver.start()
    useFaceStage.setState({ mounted: true })
    return () => {
      driver.destroy()
      useFaceStage.setState({ mounted: false, painter: undefined })
    }
  }, [])

  useEffect(() => {
    theFace().setLiveness(liveness)
  }, [liveness])
  useEffect(() => {
    theFace().express(expression)
  }, [expression])

  return (
    <div
      data-slot="face-stage"
      data-press="off"
      className="pointer-events-none fixed inset-0 z-[44] overflow-hidden"
    >
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
          className="face-plate size-full"
          style={{ willChange: 'transform' }}
        >
          <div ref={screen} className="size-full" />
        </div>
      </div>
      <span role="status" className="sr-only">
        Theo is {words}
      </span>
    </div>
  )
}
