// SOURCING: Remotion (Sequence, spring, interpolate, Img) and @remotion/media (Video, Audio). Scene content is original: the brief's storyboard, the site's palette and the real Theorem capture.
import { Audio, Video } from '@remotion/media'
import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Life } from './life'
import {
  BRASS,
  DARK_BRASS,
  MUTED,
  PAPER,
  RAISED_SLATE,
  SANS,
  SLATE,
  TITLE,
  landscape,
  unit,
} from './theme'
import type { Layout } from './theme'
import { FPS, length, PHRASES, SCENES } from './timeline'
import type { Span } from './timeline'

export interface ArchivalClip {
  /** Under film/public, and only once its permission is on record in manifest.json. */
  src: string
  trimBefore: number
  /** Says what it is and when, such as "Licklider · 1986". */
  label: string
}

/** One retimed run through a capture, seconds into the file, across a span of the film. */
export interface Take {
  src: string
  from: number
  to: number
  span: Span
}

export interface FilmProps extends Record<string, unknown> {
  layout: Layout
  /** Narration clips by line, or one founder take from frame 0. */
  voice: 'lines' | { take: string }
  takes: Take[]
  /** Where the composer sits in the capture, as shares of the frame: the typing shot pushes in on it. */
  composer: { x: number; y: number; zoom: number }
  /** Cleared footage for the two history plates. Without it they are original typography, which is the published default. */
  archival: { licklider: ArchivalClip | null; engelbart: ArchivalClip | null }
}

const useU = (layout: Layout) => unit(layout, useVideoConfig().width)

/** A line that rises out of its own baseline. */
function Rise({ delay, children }: { delay: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 120, mass: 0.7 } })
  return (
    <div style={{ overflow: 'hidden', paddingBottom: '0.14em', marginBottom: '-0.14em' }}>
      <div style={{ transform: `translateY(${(1 - t) * 112}%)` }}>{children}</div>
    </div>
  )
}

/** Low-resolution footage gets a deliberate frame and says what it is, instead of being stretched. */
function ArchivalFrame({ clip, ink, u }: { clip: ArchivalClip; ink: string; u: number }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 6 * u, border: `${1.5 * u}px solid ${ink}` }}>
        <Video
          src={staticFile(clip.src)}
          trimBefore={clip.trimBefore}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
      <div style={{ marginTop: 16 * u, fontSize: 34 * u, color: ink }}>{clip.label}</div>
    </div>
  )
}

function Symbiosis({ layout, clip }: { layout: Layout; clip: ArchivalClip | null }) {
  const frame = useCurrentFrame()
  const u = useU(layout)
  const desktop = landscape(layout)
  const push = interpolate(frame, [0, length(SCENES.symbiosis)], [1, 1.035])
  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: SANS }}>
      <Life
        seed={1960}
        cell={desktop ? 26 : 22}
        color={MUTED}
       
        opacity={0.55}
        style={{
          maskImage: desktop
            ? 'linear-gradient(90deg, transparent 38%, black 78%)'
            : 'linear-gradient(0deg, black 0%, transparent 42%)',
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          padding: desktop ? `0 ${170 * u}px` : `0 ${64 * u}px`,
          transform: `scale(${push})`,
          transformOrigin: desktop ? '0% 50%' : '50% 50%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 90 * u, flexDirection: desktop ? 'row' : 'column' }}>
          <div style={{ flex: '0 0 auto', width: desktop && clip ? '62%' : '100%' }}>
            <Rise delay={3}>
              <div style={{ fontSize: (desktop ? 56 : 42) * u, color: MUTED, marginBottom: 24 * u }}>
                J. C. R. Licklider
              </div>
            </Rise>
            <div style={{ fontSize: (desktop ? 196 : 116) * u, lineHeight: 1.02, fontWeight: 500, letterSpacing: '-0.03em', color: SLATE }}>
              <Rise delay={6}>Man-Computer</Rise>
              <Rise delay={11}>Symbiosis</Rise>
            </div>
            <Rise delay={18}>
              <div style={{ fontSize: (desktop ? 84 : 64) * u, color: DARK_BRASS, marginTop: 26 * u, fontWeight: 500 }}>1960</div>
            </Rise>
          </div>
          {clip && <ArchivalFrame clip={clip} ink={MUTED} u={u} />}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Each line is written by one of two people on one display; their cursors show whose hand it is. */
const SHARED = [
  { who: 0, text: 'Course of action', from: 6, to: 34, head: true },
  { who: 1, text: '1  Say what we want to find out', from: 30, to: 64 },
  { who: 0, text: '2  Point at the same line', from: 60, to: 88 },
  { who: 1, text: '3  Talk it through', from: 84, to: 108 },
] as const
const PEOPLE = [
  { name: 'Engelbart', place: 'San Francisco', color: BRASS },
  { name: 'Paxton', place: 'Menlo Park', color: PAPER },
] as const

function Cursor({ who, u, typing }: { who: 0 | 1; u: number; typing: boolean }) {
  const person = PEOPLE[who]
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 0, height: '1em', verticalAlign: '-0.1em' }}>
      <span
        style={{
          position: 'absolute',
          left: 8 * u,
          top: '-0.05em',
          width: 5 * u,
          height: '1.15em',
          background: person.color,
          opacity: typing ? 1 : 0.6,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 8 * u,
          top: '1.2em',
          fontSize: 30 * u,
          fontWeight: 500,
          lineHeight: 1,
          padding: `${7 * u}px ${12 * u}px`,
          borderRadius: 4 * u,
          whiteSpace: 'nowrap',
          background: person.color,
          color: SLATE,
          letterSpacing: 0,
          zIndex: 2,
        }}
      >
        {person.name}
      </span>
    </span>
  )
}

function Nls({ layout, clip }: { layout: Layout; clip: ArchivalClip | null }) {
  const frame = useCurrentFrame()
  const u = useU(layout)
  const desktop = landscape(layout)
  const typed = (from: number, to: number, text: string) =>
    Math.round(interpolate(frame, [from, to], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  // A cursor stays at the end of the last line its person wrote.
  const lastOf = (who: 0 | 1) =>
    SHARED.reduce((last, line, i) => (line.who === who && frame >= line.from ? i : last), -1)
  return (
    <AbsoluteFill style={{ background: SLATE, fontFamily: SANS, color: PAPER, padding: desktop ? `${96 * u}px ${170 * u}px` : `${120 * u}px ${56 * u}px`, justifyContent: 'center' }}>
      <Rise delay={2}>
        <div style={{ fontSize: (desktop ? 72 : 44) * u, fontWeight: 500, letterSpacing: '-0.015em', marginBottom: (desktop ? 48 : 40) * u }}>
          NLS <span style={{ color: BRASS }}>·</span> December 9, 1968
        </div>
      </Rise>
      {clip ? (
        <ArchivalFrame clip={clip} ink={BRASS} u={u} />
      ) : (
        <div
          style={{
            background: RAISED_SLATE,
            borderRadius: 10 * u,
            padding: desktop ? `${60 * u}px ${72 * u}px ${96 * u}px` : `${44 * u}px ${36 * u}px ${88 * u}px`,
            fontSize: (desktop ? 72 : 44) * u,
            lineHeight: 1.5,
            minHeight: (desktop ? 540 : 640) * u,
          }}
        >
          {SHARED.map((line, i) => {
            const count = typed(line.from, line.to, line.text)
            const at = (who: 0 | 1) => lastOf(who) === i
            if (frame < line.from) return null
            return (
              <div key={line.text} style={{ whiteSpace: 'pre', fontWeight: 'head' in line ? 600 : 400, color: 'head' in line ? BRASS : PAPER, marginBottom: 10 * u, minHeight: '1.5em' }}>
                {line.text.slice(0, count)}
                {at(line.who) && <Cursor who={line.who} u={u} typing={count < line.text.length} />}
              </div>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 * u, fontSize: (desktop ? 36 : 26) * u, color: '#AEB5C0', gap: 24 * u }}>
        <span>{clip ? '' : 'Two people, thirty miles apart, on one display.'}</span>
        {!clip && <span>Illustration</span>}
      </div>
    </AbsoluteFill>
  )
}

interface Shot {
  frames: number
  background: string
  mark: string
  image?: string
  /** A plate's own field, in place of an image. */
  life?: { seed: number; color: string }
  /** Which part of the capture this crop holds, for the desktop composition. */
  zoom?: number
  origin?: string
}

/**
 * The turn from history to product: one mark held dead still while the picture
 * behind it cuts, starting at 100 ms and slowing to 400 ms. The fast shots stay
 * on one side of the luminance range, and the colourway changes only once the
 * cuts have slowed, which keeps this under three flashes in any second.
 */
const shots = (layout: Layout): Shot[] => {
  // The tube cuts between the desktop's stills, cropped to its frame.
  const image = (name: string) => `capture/shots/${name}-${landscape(layout) ? 'desktop' : 'phone'}.jpg`
  return [
    { frames: 3, background: PAPER, mark: SLATE, image: image('typed'), zoom: 2.1, origin: '57% 55%' },
    { frames: 3, background: PAPER, mark: SLATE, life: { seed: 11, color: MUTED } },
    { frames: 3, background: PAPER, mark: SLATE, image: image('early'), zoom: 1.7, origin: '60% 30%' },
    { frames: 3, background: PAPER, mark: SLATE, image: image('rail'), zoom: 1.5, origin: '6% 40%' },
    { frames: 6, background: PAPER, mark: SLATE, life: { seed: 23, color: DARK_BRASS } },
    { frames: 6, background: PAPER, mark: SLATE, image: image('mid'), zoom: 1.5, origin: '65% 60%' },
    { frames: 6, background: PAPER, mark: SLATE, image: image('late'), zoom: 1.25, origin: '60% 40%' },
    { frames: 9, background: SLATE, mark: PAPER, life: { seed: 37, color: BRASS } },
    { frames: 9, background: BRASS, mark: SLATE },
    { frames: 12, background: SLATE, mark: BRASS, life: { seed: 53, color: PAPER } },
  ]
}

function Turn({ layout }: { layout: Layout }) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const u = useU(layout)
  const desktop = landscape(layout)
  const list = shots(layout)
  let at = 0
  let shot = list[0] as Shot
  for (const next of list) {
    shot = next
    if (frame < at + next.frames) break
    at += next.frames
  }
  const fill: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' }
  return (
    <AbsoluteFill style={{ background: shot.background }}>
      {shot.image && (
        <AbsoluteFill style={{ transform: `scale(${desktop ? (shot.zoom ?? 1) : 1})`, transformOrigin: shot.origin }}>
          <Img src={staticFile(shot.image)} style={fill} />
          <AbsoluteFill style={{ background: PAPER, opacity: 0.32 }} />
        </AbsoluteFill>
      )}
      {shot.life && <Life seed={shot.life.seed} cell={(desktop ? 34 : 30) * u} color={shot.life.color} rate={0} />}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: TITLE, fontSize: width * (desktop ? 0.205 : 0.262), lineHeight: 1, color: shot.mark, letterSpacing: '-0.005em' }}>
          THEOREM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Plays a stretch of a capture across a span of the film, at whatever rate that takes. */
function Retimed({ take, extra }: { take: Take; extra: number }) {
  const rate = (take.to - take.from) / (length(take.span) / FPS)
  return (
    <Sequence from={take.span[0]} durationInFrames={length(take.span) + extra} layout="none">
      <Video
        src={staticFile(take.src)}
        trimBefore={Math.round(take.from * FPS)}
        playbackRate={rate}
        muted
        style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </Sequence>
  )
}

/** The real app, edge to edge, ending at exactly the state the frame on the page opens to. */
function Product({ layout, props }: { layout: Layout; props: FilmProps }) {
  const frame = useCurrentFrame()
  const { x, y, zoom } = props.composer
  const push = interpolate(
    frame,
    [SCENES.typing[0], SCENES.typing[1] - 6, SCENES.typing[1] + 34],
    [zoom, zoom, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.45, 0, 0.15, 1) },
  )
  const still = interpolate(frame, [SCENES.final[0], SCENES.final[0] + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${x * 100}% ${y * 100}%` }}>
        {props.takes.map((take, i) => (
          // The last one runs on under the still as it fades in.
          <Retimed key={take.span[0]} take={take} extra={i === props.takes.length - 1 ? 8 : 0} />
        ))}
      </AbsoluteFill>
      <Img
        src={staticFile(`capture/final-${layout}.png`)}
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: still }}
      />
    </AbsoluteFill>
  )
}

export function Film(props: FilmProps) {
  const { layout, voice, archival } = props
  const frame = useCurrentFrame()
  const productUp = frame >= SCENES.typing[0]
  return (
    <AbsoluteFill style={{ background: SLATE }}>
      <Sequence name="Licklider" from={SCENES.symbiosis[0]} durationInFrames={length(SCENES.symbiosis)}>
        <Symbiosis layout={layout} clip={archival.licklider} />
      </Sequence>
      <Sequence name="Engelbart and Paxton" from={SCENES.nls[0]} durationInFrames={length(SCENES.nls)}>
        <Nls layout={layout} clip={archival.engelbart} />
      </Sequence>
      <Sequence name="The turn" from={SCENES.turn[0]} durationInFrames={length(SCENES.turn)}>
        <Turn layout={layout} />
      </Sequence>
      {productUp && <Product layout={layout} props={props} />}
      {voice === 'lines' ? (
        PHRASES.map((line) => (
          <Sequence key={line.audio} name={line.text.slice(0, 24)} from={line.from} layout="none">
            <Audio src={staticFile(line.audio)} />
          </Sequence>
        ))
      ) : (
        <Audio src={staticFile(voice.take)} />
      )}
    </AbsoluteFill>
  )
}
