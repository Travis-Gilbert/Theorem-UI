// SOURCING: @uidotdev/usehooks's useIdle for when no one is moving anywhere in the window (media-chrome's own inactivity only sees the pointer over its controller, and in the room the controller is the bar alone); media-chrome 4.19 (the controller, play, range, time, mute and captions controls; its range and keyboard behaviour are why this is not built by hand) around a native <video>; coss Button for Skip and the transcript. In the room the picture is on the tube (a three VideoTexture of this element), so the controller sits in the viewport and the captions are the track's own active cues, read through the TextTrack API.
import { useIdle } from '@uidotdev/usehooks'
import { FileText, SkipForward } from 'lucide-react'
import {
  MediaCaptionsButton,
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { experience as copy, transcript } from '@/content'
import { useExperience } from './experience'

/** No pointer or key for this long while the film plays, and its bar recedes. */
const IDLE_MS = 2_500

/**
 * The narrated film. Mounted from the start with no source so that the click
 * that starts it can call play() in the same gesture, and hidden until then.
 * `stage` lays it over the monitor's screen; `viewport` keeps only its controls
 * and captions on screen, along the bottom of the window.
 */
export function Film({ placement = 'stage' }: { placement?: 'stage' | 'viewport' }) {
  const exp = useExperience()
  const watching = exp.phase === 'watching'
  const viewport = placement === 'viewport'
  const idle = useIdle(IDLE_MS)
  return (
    <div
      role="group"
      aria-label={copy.film.title}
      data-idle={watching && idle}
      className={viewport ? 'film-host film-viewport' : 'film-host absolute inset-0 z-30'}
      style={{ visibility: watching ? 'visible' : 'hidden' }}
    >
      {viewport && <Captions />}
      <MediaController
        className={viewport ? 'film film-in-viewport' : 'film'}
        defaultSubtitles
        noAutoSeekToLive
        {...{ audio: viewport ? true : undefined }}
      >
        <video
          ref={exp.videoRef}
          slot="media"
          playsInline
          preload="none"
          crossOrigin="anonymous"
          onEnded={exp.filmEnded}
          onError={exp.filmFailed}
          className={viewport ? 'film-source' : undefined}
        >
          <track
            kind="captions"
            src={exp.assets.captions}
            srcLang="en"
            label="English"
            default
          />
        </video>
        {/* Skip and pause stay on screen: a film this short has no reason to hide them. While it plays the bar only recedes (styles.css). */}
        <MediaControlBar className="film-bar" {...{ noautohide: true }}>
          <MediaPlayButton />
          <MediaTimeRange />
          <MediaTimeDisplay showDuration className="max-sm:hidden" />
          <MediaMuteButton />
          <MediaCaptionsButton />
          <Button
            variant="ghost"
            size="icon"
            className="text-paper hover:bg-paper/12"
            aria-label={transcript.title}
            tabIndex={watching ? 0 : -1}
            onClick={() => exp.setTranscriptOpen(true)}
          >
            <FileText aria-hidden />
          </Button>
          <Button
            size="sm"
            className="brass-action ml-1"
            tabIndex={watching ? 0 : -1}
            onClick={exp.skip}
          >
            <SkipForward aria-hidden />
            {copy.film.skip}
          </Button>
        </MediaControlBar>
      </MediaController>
    </div>
  )
}

/** The cue being spoken, while captions are on. The captions button turns the track off, and with it this. */
function Captions() {
  const { videoRef } = useExperience()
  const [line, setLine] = useState('')
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const tracks = video.textTracks
    let track: TextTrack | null = null
    const read = () => {
      const cue = track?.activeCues?.[0]
      setLine(cue instanceof VTTCue ? cue.text : '')
    }
    const attach = () => {
      track?.removeEventListener('cuechange', read)
      track = tracks[0] ?? null
      track?.addEventListener('cuechange', read)
      read()
    }
    attach()
    tracks.addEventListener('change', read)
    tracks.addEventListener('addtrack', attach)
    return () => {
      track?.removeEventListener('cuechange', read)
      tracks.removeEventListener('change', read)
      tracks.removeEventListener('addtrack', attach)
    }
  }, [videoRef])
  return (
    <p aria-hidden className="film-caption" data-empty={!line}>
      {line}
    </p>
  )
}
