// SOURCING: Remotion's Composition. The default props are the film's input parameters, and state/thread.json is the capture they were measured from.
import { Composition } from 'remotion'
import state from '../state/thread.json'
import { Ambient, AMBIENT_FRAMES } from './ambient'
import { Film } from './film'
import { APPROACH_FRAMES, Approach } from './study/approach'
import type { FilmProps } from './film'
import { DURATION, FPS, SCENES } from './timeline'

const { marks, typing, phone: onPhone } = state
const TURN = 'capture/turn-desktop.mp4'
const none = { licklider: null, engelbart: null }

const desktop: FilmProps = {
  layout: 'desktop',
  voice: 'lines',
  composer: { x: 0.574, y: 0.56, zoom: 1.5 },
  takes: [
    { src: 'capture/typing-desktop.mp4', from: 0.4, to: typing.seconds - 0.2, span: SCENES.typing },
    { src: TURN, from: marks.sent, to: marks.answered, span: SCENES.answer },
    { src: TURN, from: marks.typing, to: marks.resent, span: SCENES.followUp },
    { src: TURN, from: marks.resent, to: marks.done, span: SCENES.outcome },
  ],
  archival: none,
}

/**
 * The study's tube: the desktop's takes, cropped to the tube's frame, so the composer's
 * place moves inward with the crop; the last frame is the app at the tube's size.
 */
const TUBE = { width: 2028, height: 1464 }
const crop = (x: number) => {
  const kept = TUBE.width / TUBE.height / (1920 / 1080)
  return Number(((x - (1 - kept) / 2) / kept).toFixed(3))
}
const tube: FilmProps = {
  ...desktop,
  layout: 'tube',
  composer: { ...desktop.composer, x: crop(desktop.composer.x) },
}

const phone: FilmProps = {
  layout: 'phone',
  voice: 'lines',
  composer: { x: 0.5, y: 0.5, zoom: 1 },
  takes: [
    { src: 'capture/typing-phone.mp4', from: 0.4, to: onPhone.typing.seconds - 0.2, span: SCENES.typing },
    { src: 'capture/thread-phone.mp4', from: 0.4, to: onPhone.scroll.seconds, span: [SCENES.answer[0], SCENES.outcome[1]] },
  ],
  archival: none,
}

export const RemotionRoot = () => (
  <>
    <Composition id="TheoremDesktop" component={Film} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} defaultProps={desktop} />
    <Composition id="TheoremPhone" component={Film} durationInFrames={DURATION} fps={FPS} width={780} height={1440} defaultProps={phone} />
    <Composition id="TheoremTube" component={Film} durationInFrames={DURATION} fps={FPS} width={TUBE.width} height={TUBE.height} defaultProps={tube} />
    <Composition id="AmbientDesktop" component={Ambient} durationInFrames={AMBIENT_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ layout: 'desktop' as const }} />
    <Composition id="AmbientPhone" component={Ambient} durationInFrames={AMBIENT_FRAMES} fps={FPS} width={780} height={1440} defaultProps={{ layout: 'phone' as const }} />
    <Composition id="AmbientTube" component={Ambient} durationInFrames={AMBIENT_FRAMES} fps={FPS} width={TUBE.width} height={TUBE.height} defaultProps={{ layout: 'tube' as const }} />
    <Composition id="StudyApproach" component={Approach} durationInFrames={APPROACH_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ glass: true }} />
  </>
)
