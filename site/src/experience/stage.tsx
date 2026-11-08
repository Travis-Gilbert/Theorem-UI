// SOURCING: a platform <iframe> (the real app), a native <img> and <video>, ResizeObserver for the scale, coss Button and Spinner for the status. Nothing upstream models several states of one screen sharing one rectangle.
import { useEffect, useLayoutEffect, useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { experience as copy, transcript } from '@/content'
import { LOGICAL, useExperience } from './experience'
import { coverIsUp } from './machine'
import { Place } from '@/lib/movable'

/**
 * One rectangle, in order from the back: the app (always the same element, never
 * remounted), the poster, the final still, the film, the status. The app is given
 * its logical size and scaled, so it lays out the same however big the monitor is.
 * In the room the tube itself shows the loop and the film, and the film's controls
 * are in the viewport, so the stage is the app, the still and the status, at the
 * tube's own size, or larger when expanded.
 */
export function Stage({
  room = false,
  logical: override,
  film,
}: {
  room?: boolean
  /** Expanded in the room, the app lays out larger than the tube; the element is the same, so it is not reloaded. */
  logical?: { width: number; height: number }
  /** The film's movable node, shown over the screen outside the room. */
  film?: HTMLElement
}) {
  const exp = useExperience()
  const { phase, state, layout, assets, appUrl } = exp
  const logical = override ?? LOGICAL[layout]
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const stage = exp.stageRef.current
    if (!stage) return
    const measure = () => setScale(stage.clientWidth / logical.width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [exp.stageRef, logical.width])

  const showsApp = state.app !== 'idle' && state.app !== 'absent'
  const ambient = phase === 'ambient'
  // After Back to scene, a visitor who has used the app sees it, not a poster.
  const posterUp = ambient && !(state.entered && state.app === 'ready')
  const coverUp = coverIsUp(state, phase)
  const stageAspect = logical.width / logical.height

  return (
    <div
      ref={exp.stageRef}
      tabIndex={-1}
      data-phase={phase}
      data-film={state.film}
      data-app={state.app}
      data-active={exp.active}
      data-layout={layout}
      className="stage outline-none"
      style={{
        aspectRatio: `${logical.width} / ${logical.height}`,
        width: room ? '100%' : `min(100%, calc((100svh - 6rem) * ${stageAspect}))`,
      }}
    >
      {showsApp && appUrl && (
        <div
          className="stage-logical"
          style={{
            width: logical.width,
            height: logical.height,
            transform: `scale(${scale})`,
            pointerEvents: exp.active ? undefined : 'none',
          }}
        >
          <iframe
            ref={exp.iframeRef}
            title={copy.frameTitle}
            allow="clipboard-write"
            tabIndex={exp.active ? 0 : -1}
            inert={!exp.active}
            className="stage-frame"
          />
        </div>
      )}

      {!room && <Poster up={posterUp} />}

      <img
        src={assets[layout].still}
        alt=""
        aria-hidden
        data-up={coverUp}
        className="stage-layer stage-cover z-20 data-[up=false]:pointer-events-none data-[up=false]:opacity-0 data-[up=true]:opacity-100 data-[up=true]:transition-none"
      />

      {!room && film && <Place node={film} />}

      <Status room={room} />
    </div>
  )
}

function Poster({ up }: { up: boolean }) {
  const exp = useExperience()
  const asset = exp.assets[exp.layout]
  const ambientVideo = exp.motion && up && asset.ambient
  return (
    <div
      className="absolute inset-0 z-10"
      style={{ visibility: up ? 'visible' : 'hidden' }}
    >
      <img
        src={asset.poster}
        alt=""
        aria-hidden
        className="stage-layer"
      />
      {ambientVideo && (
        <video
          key={asset.ambient}
          src={asset.ambient}
          poster={asset.poster}
          muted
          loop
          autoPlay
          playsInline
          aria-hidden
          className="stage-layer"
        />
      )}
      <button
        type="button"
        aria-label={copy.watchLabel}
        tabIndex={up ? 0 : -1}
        onClick={exp.play}
        className="group absolute inset-0 grid cursor-pointer items-end justify-items-center bg-transparent pb-24"
      >
        <span className="brass-action grid size-16 place-items-center rounded-full border bg-brass text-slate shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none">
          <Play aria-hidden className="size-7 translate-x-0.5" fill="currentColor" />
        </span>
      </button>
    </div>
  )
}

function Status({ room }: { room: boolean }) {
  const exp = useExperience()
  const { phase, state, slow, appUrl } = exp
  const [visible, setVisible] = useState<string | null>(null)

  const message =
    phase === 'preparing' && !state.entered
      ? 'preparing'
      : phase === 'unavailable'
        ? state.app === 'absent'
          ? 'absent'
          : 'failed'
        : phase === 'ambient' && state.film === 'failed'
          ? 'film-failed'
          : null

  // A short hold, so a ready app does not flash a loading line on the way past.
  useEffect(() => {
    if (message !== 'preparing') {
      setVisible(message)
      return
    }
    const timer = setTimeout(() => setVisible('preparing'), 260)
    return () => clearTimeout(timer)
  }, [message])

  if (visible !== message) return null
  if (message === 'preparing')
    return (
      <div className="on-slate absolute bottom-3 left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-slate/92 px-3 py-2 text-sm text-paper shadow-lg">
        <span role="status" className="flex items-center gap-2">
          <Spinner className="size-4 text-brass" />
          {slow ? copy.status.slow : copy.status.preparing}
        </span>
        {slow && (
          <span className="flex items-center gap-2">
            <Button size="xs" variant="secondary" className="bg-slate-raised" onClick={exp.retry}>
              {copy.status.retry}
            </Button>
            <DirectLink href={appUrl} />
          </span>
        )}
      </div>
    )
  if (message === 'failed' || message === 'absent')
    return (
      <Panel
        title={message === 'failed' ? copy.status.failed : copy.status.absent}
        detail={message === 'failed' ? copy.status.failedDetail : undefined}
      >
        {message === 'failed' ? (
          <>
            <Button className="brass-action" onClick={exp.retry}>
              {copy.status.retry}
            </Button>
            <DirectLink href={appUrl} />
          </>
        ) : (
          <Button className="brass-action" render={<a href="#join" />}>
            {copy.status.absentAction}
          </Button>
        )}
      </Panel>
    )
  // In the room the camera is back on the wide view and the tube is out of sight, so the room shows this in the viewport.
  if (message === 'film-failed' && !room)
    return (
      <div className="on-slate absolute inset-0 z-40 grid place-items-center bg-slate/72 p-4">
        <FilmFailedNotice />
      </div>
    )
  return null
}

function Panel({ title, detail, children }: NoticeProps) {
  return (
    <div className="on-slate absolute inset-0 z-40 grid place-items-center bg-slate/72 p-4">
      <Notice title={title} detail={detail}>
        {children}
      </Notice>
    </div>
  )
}

/** The film did not load: read it instead, or go straight to the app. */
export function FilmFailedNotice() {
  const exp = useExperience()
  return (
    <Notice title={copy.status.filmFailed} detail={copy.status.filmFailedDetail}>
      <Button className="brass-action" onClick={exp.tryApp}>
        {copy.try}
      </Button>
      <Button variant="secondary" className="bg-slate-raised" onClick={() => exp.setTranscriptOpen(true)}>
        {transcript.title}
      </Button>
    </Notice>
  )
}

interface NoticeProps {
  title: string
  detail?: string
  children: React.ReactNode
}

function Notice({ title, detail, children }: NoticeProps) {
  return (
    <div role="alert" className="on-slate max-w-md rounded-xl bg-slate p-5 text-paper shadow-xl ring-1 ring-slate-raised">
      <p className="text-lg font-semibold text-balance">{title}</p>
      {detail && <p className="mt-1 text-sm text-paper/76">{detail}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function DirectLink({ href }: { href: string | undefined }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-brass underline underline-offset-3"
    >
      {copy.status.open}
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  )
}
