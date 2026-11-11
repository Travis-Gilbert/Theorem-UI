// SOURCING: the study's bench (theorem-face-study src/app.js: a face beside the controls that drive it) rebuilt on lib/face: every button here calls the same engine the agent's operations and the reaction rules call. For stories only; the app mounts components/face/face-stage.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Face, plainGaze } from '@/lib/face/engine'
import { THEO } from '@/lib/face/identity'
import { useFaceHue, useFaceLook } from './look'
import { canvasPainter, createPainter } from './painter'
import type { Painter } from './painter'

const RATIO = THEO.height / THEO.width

/** A face drawn at a width, outside the shell. Running, it animates; still, it draws the face as it stands. */
export function FaceView({
  face,
  width,
  running,
  plain = false,
  onPainter,
}: {
  face: Face
  width: number
  running: boolean
  /** Draw with Canvas2D whatever the browser has; a sheet of many faces would run out of WebGL contexts. */
  plain?: boolean
  onPainter?: (kind: Painter['kind']) => void
}) {
  const box = useRef<HTMLDivElement | null>(null)
  const plate = useRef<HTMLDivElement | null>(null)
  const { visor, ink } = useFaceLook()
  const hue = useFaceHue()

  useEffect(() => {
    const host = box.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = 'block size-full'
    host.replaceChildren(canvas)
    face.tint(hue)
    let painter: Painter | undefined
    let frame = 0
    let gone = false
    const draw = () => {
      painter?.draw(face.buffer, face.field.count, THEO.width, THEO.height, ink)
      const head = face.head()
      const unit = width / THEO.width
      if (plate.current)
        plate.current.style.transform = `translate(${head.dx * unit}px, ${head.dy * unit}px) rotate(${head.tilt}deg) scale(${head.scale * (1 + head.squash)}, ${head.scale * (1 - head.squash)})`
    }
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      face.frame(now)
      draw()
    }
    const ready = (made: Painter | undefined) => {
      if (gone) return made?.destroy()
      painter = made
      if (made) onPainter?.(made.kind)
      if (running) frame = requestAnimationFrame(loop)
      else {
        // A still face is drawn a few times over: the canvas takes its size a frame or two after it mounts.
        let left = 12
        const again = () => {
          draw()
          if (--left > 0) frame = requestAnimationFrame(again)
        }
        again()
      }
    }
    if (plain) ready(canvasPainter(canvas))
    else
      void createPainter(canvas, () => {
        const fresh = document.createElement('canvas')
        fresh.className = canvas.className
        host.replaceChildren(fresh)
        return fresh
      }).then(ready)
    return () => {
      gone = true
      cancelAnimationFrame(frame)
      painter?.destroy()
    }
  }, [face, width, running, plain, onPainter, ink, hue])

  return (
    <div
      ref={plate}
      data-visor={visor ? 'on' : 'off'}
      className="face-plate"
      style={{ width, height: width * RATIO, borderRadius: width * 0.18 }}
    >
      <div ref={box} className="size-full" />
    </div>
  )
}

/** A face advanced a fixed way: the same picture every time, for an oracle to diff. */
function frozenFace(name: string | undefined, at: number, seed = 7) {
  let now = 1_700_000_000_000
  const face = new Face({ seed, clock: () => now })
  face.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 8) {
      now += 8
      face.advance(0.008)
    }
  }
  run(400)
  if (name) face.perform(name, { owner: 'story', seed })
  run(at)
  return face
}

/** Every performance in the book, each stopped at its fullest moment. */
export function FaceBook() {
  const cells = useMemo(() => {
    const names = new Face({ seed: 7 }).book.list().map((entry) => entry.name)
    return ['rest', ...names].map((name) => {
      const probe = name === 'rest' ? undefined : name
      // Most performances are fullest a little past their first move.
      const at =
        name === 'sleep'
          ? 2_600
          : name === 'skeptic'
            ? 900
            : name === 'blink'
              ? 90
              : name === 'dizzy' || name === 'melt'
                ? 700
                : 420
      return { name, face: frozenFace(probe, at) }
    })
  }, [])
  return (
    <div
      className="bg-background grid grid-cols-5 gap-4 p-5"
      data-slot="face-book"
    >
      {cells.map(({ name, face }) => (
        <figure key={name} className="flex flex-col items-center gap-1.5">
          <FaceView face={face} width={128} running={false} plain />
          <figcaption className="text-ink-muted text-xs">{name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

const EVENTS = [
  'person.poke',
  'person.pet',
  'person.send',
  'run.tool',
  'run.tool.fail',
  'run.done',
  'env.resize',
  'env.theme',
  'env.offline',
] as const

const SAMPLE = `{
  "steps": [
    { "op": "feature", "id": "mouth", "set": { "w": 7, "h": 1.6, "y": 20, "x": 0, "share": 0.25, "round": 6 } },
    { "op": "par", "steps": [
      { "op": "to", "set": { "eyes.lowBow": 0.8, "mouth.w": 12, "mouth.lowBow": -0.9, "mouth.h": 4 }, "over": 260, "bounce": 0.5, "hold": 900 },
      { "op": "wave", "channel": "face.tilt", "amp": 6, "period": 520, "for": 1100 }
    ] }
  ]
}`

/**
 * The bench: one large face and everything that can move it. With `?do=name`
 * and `?at=ms` in the address it plays one performance to a fixed moment and
 * stops, so a screenshot of it is the same every time.
 */
export function FaceBench() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const frozenAt = params.get('at')
  const frozen = frozenAt !== null
  const face = useMemo(
    () =>
      frozen
        ? frozenFace(params.get('do') ?? undefined, Number(frozenAt) || 0)
        : (() => {
            const made = new Face({ seed: 7 })
            made.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
            return made
          })(),
    [frozen, frozenAt, params],
  )
  const [painter, setPainter] = useState<string>('…')
  const [log, setLog] = useState<Array<string>>([])
  const [source, setSource] = useState(SAMPLE)
  const [state, setState] = useState('')
  const say = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8))

  useEffect(() => {
    if (frozen) return
    const timer = setInterval(
      () => setState(`${face.words()} · ${JSON.stringify(face.state().mood)}`),
      250,
    )
    return () => clearInterval(timer)
  }, [face, frozen])

  const play = (input: unknown, label: string) => {
    const performed = face.perform(input, { owner: 'bench' })
    say(
      performed.ok
        ? `${label}: ${performed.invocation.id}, ${Math.round(performed.invocation.ms)} ms${performed.notes.length ? ` (${performed.notes.join(' ')})` : ''}`
        : `${label} refused at ${performed.path || 'the program'}: ${performed.reason}`,
    )
  }

  return (
    <div
      className="bg-background text-ink flex min-h-dvh gap-6 p-6"
      data-slot="face-bench"
    >
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="Poke Theo"
          className="cursor-pointer rounded-[58px] outline-offset-4"
          onClick={() => say(`poke → ${face.poke()?.name ?? 'nothing'}`)}
        >
          <FaceView
            face={face}
            width={320}
            running={!frozen}
            onPainter={setPainter}
          />
        </button>
        <p
          className="text-ink-muted text-xs"
          data-slot="face-painter"
          data-painter={painter}
        >
          drawn by {painter}
        </p>
        <p className="text-ink-muted max-w-80 text-center text-xs">{state}</p>
      </div>
      {frozen ? null : (
        <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm">
          <section>
            <h2 className="mb-1.5 font-medium">The book</h2>
            <div className="flex flex-wrap gap-1.5">
              {face.book.list().map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  title={entry.note}
                  className="border-separator hover:bg-hover rounded-md border px-2 py-1"
                  onClick={() => play(entry.name, entry.name)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-1.5 font-medium">Events</h2>
            <div className="flex flex-wrap gap-1.5">
              {EVENTS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="border-separator hover:bg-hover rounded-md border px-2 py-1"
                  onClick={() =>
                    say(`${kind} → ${face.notice(kind)?.name ?? 'nothing'}`)
                  }
                >
                  {kind}
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <h2 className="font-medium">A program nobody named</h2>
            <textarea
              aria-label="Program"
              className="border-separator bg-background h-48 rounded-md border p-2 font-mono text-xs"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
            <button
              type="button"
              className="border-separator hover:bg-hover self-start rounded-md border px-2 py-1"
              onClick={() => {
                try {
                  play(JSON.parse(source), 'program')
                } catch (error) {
                  say(`not JSON: ${String(error)}`)
                }
              }}
            >
              Play
            </button>
          </section>
          <ol className="text-ink-muted font-mono text-xs" aria-label="Log">
            {log.map((line, index) => (
              <li key={`${index}${line}`}>{line}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
