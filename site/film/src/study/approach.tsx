// SOURCING: @remotion/three (ThreeCanvas, and its two video textures: the offthread one only exists while rendering), Remotion's interpolate and Easing, drei's CameraControls driven by the same poses the live room uses, so one controller owns the camera in both.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { ThreeCanvas, useOffthreadVideoTexture, useVideoTexture } from '@remotion/three'
import {
  AbsoluteFill,
  Easing,
  Html5Video,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useRemotionEnvironment,
  useVideoConfig,
} from 'remotion'
import * as THREE from 'three'
import { GLASS, ROOM_ASSETS, StudyRoom } from '../../../src/study/room'
import type { RoomAssets } from '../../../src/study/room'
import { FOV, SHOTS } from '../../../src/study/shots'
import { useSeededField } from './seeded-field'
import { PAPER } from '../theme'

/** A held opening, the move, and the settled screen. */
const OPEN = 26
const MOVE = 120
const SETTLED = 64
export const APPROACH_FRAMES = OPEN + MOVE + SETTLED

const SEED = 20261106
const TUBE = 'study/tube.mp4'
/** The room's own assets, from the film's public folder (a link to the site's). */
const local = (path: string) => staticFile(path.replace(/^\//, ''))
const ASSETS: RoomAssets = {
  ...(Object.fromEntries(
    Object.entries(ROOM_ASSETS).map(([key, path]) => [key, typeof path === 'string' ? local(path) : path]),
  ) as RoomAssets),
  covers: {
    dream: local(ROOM_ASSETS.covers.dream),
    hamming: local(ROOM_ASSETS.covers.hamming),
    everyone: local(ROOM_ASSETS.covers.everyone),
  },
}

function Scene({ film, glass }: { film: THREE.Texture | null; glass: boolean }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const controls = useRef<CameraControls>(null)
  const field = useSeededField(SEED, frame, fps)

  // Before ThreeCanvas's own effect advances the renderer for this frame.
  useLayoutEffect(() => {
    field.draw()
    const t = interpolate(frame, [OPEN, OPEN + MOVE], [0, 1], {
      easing: Easing.bezier(0.55, 0, 0.15, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    const { opening: a, experience: b } = SHOTS
    controls.current?.lerpLookAt(...a.position, ...a.target, ...b.position, ...b.target, t, false)
  })

  return (
    <>
      <CameraControls ref={controls} makeDefault enabled={false} />
      <StudyRoom
        assets={ASSETS}
        film={film}
        field={field.texture}
        time={frame / fps}
        glass={glass ? GLASS : null}
      />
    </>
  )
}

/**
 * ThreeCanvas advances the renderer when the frame changes, but the tube's picture
 * for that frame lands afterwards, and the hook releases the frame as it lands.
 * So this holds every frame until that picture is on the glass and drawn.
 */
function WhileRendering({ glass }: { glass: boolean }) {
  const film = useOffthreadVideoTexture({ src: staticFile(TUBE) })
  const frame = useCurrentFrame()
  const advance = useThree((state) => state.advance)
  const { delayRender, continueRender } = useDelayRender()
  const held = useRef<number | null>(null)

  useLayoutEffect(() => {
    const handle = delayRender(`Waiting for the tube's picture at frame ${frame}`)
    held.current = handle
    return () => continueRender(handle)
  }, [frame, delayRender, continueRender])

  useEffect(() => {
    if (!film) return
    advance(performance.now())
    if (held.current !== null) continueRender(held.current)
    held.current = null
  }, [film, advance, continueRender])

  return <Scene film={film} glass={glass} />
}

const InPreview = ({ video, glass }: { video: RefObject<HTMLVideoElement | null>; glass: boolean }) => (
  <Scene film={useVideoTexture(video as RefObject<HTMLVideoElement>)} glass={glass} />
)

export function Approach({ glass }: { glass: boolean }) {
  const { width, height } = useVideoConfig()
  const { isRendering } = useRemotionEnvironment()
  const video = useRef<HTMLVideoElement>(null)
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      {!isRendering && (
        <Html5Video ref={video} src={staticFile(TUBE)} muted style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
      )}
      <ThreeCanvas
        width={width}
        height={height}
        shadows
        dpr={2}
        camera={{ fov: FOV, near: 0.02, far: 12, position: [...SHOTS.opening.position] }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <color attach="background" args={[PAPER]} />
        {isRendering ? <WhileRendering glass={glass} /> : <InPreview video={video} glass={glass} />}
      </ThreeCanvas>
    </AbsoluteFill>
  )
}
