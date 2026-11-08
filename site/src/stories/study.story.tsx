// SOURCING: @react-three/fiber's Canvas, drei's useVideoTexture and CameraControls (one controller owns the camera). `?at=` picks a pose from shots.ts (opening, experience, licklider, engelbart, turn, approach), `?held` holds the Life on a settled frame and the glass where it is, `?glass=0` takes the liquid glass off, `?tube=ambient` plays the dark ambient loop on the tube instead of the app's recording, `window.__study` carries the checks, among them the tube's light (`screenLight`).
import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { CameraControls, useVideoTexture } from '@react-three/drei'
import * as THREE from 'three'
import { aliveNear, painted } from '@/field/mount-field'
import { useLiveField } from '@/study/live-field'
import { GLASS, ROOM_ASSETS, StudyRoom } from '@/study/room'
import { FOV, SHOTS } from '@/study/shots'
import type { Shot, ShotName } from '@/study/shots'

/** What plays on the tube: the app's recording, bright, or the page's ambient loop, mostly dark. */
const TUBES: Record<string, string> = { app: '/study/tube.mp4', ambient: '/film/ambient-tube.mp4' }

function Room({ at, held, seed, glass, tube }: { at: ShotName; held: boolean; seed: number; glass: boolean; tube: string }) {
  const controls = useRef<CameraControls>(null)
  const scene = useThree((state) => state.scene)
  const film = useVideoTexture(tube, {
    muted: true,
    loop: true,
    start: true,
  })
  const { texture } = useLiveField({ seed, running: !held })

  useEffect(() => {
    const shot: Shot = SHOTS[at]
    controls.current?.setLookAt(...shot.position, ...shot.target, false)
    Object.assign(window, {
      __study: {
        camera: controls.current?.camera,
        scene,
        move: (name: ShotName) => {
          const next: Shot = SHOTS[name]
          return controls.current?.setLookAt(...next.position, ...next.target, true)
        },
        look: (position: [number, number, number], target: [number, number, number]) =>
          controls.current?.setLookAt(...position, ...target, false),
        painted,
        aliveNear,
        /** The tube's light on the desk now, in nits: it follows the picture. */
        screenLight: () => (scene.getObjectByName('ScreenLight') as THREE.RectAreaLight | undefined)?.intensity ?? null,
      },
    })
  }, [at, scene])

  return (
    <>
      <CameraControls ref={controls} makeDefault smoothTime={0.6} maxDistance={3.2} minDistance={0.12} />
      <StudyRoom assets={ROOM_ASSETS} film={film} field={texture} glass={glass ? GLASS : null} time={held ? 0 : undefined} />
    </>
  )
}

export default function StudyStory() {
  const params = new URLSearchParams(location.search)
  const asked = params.get('at') ?? 'opening'
  const at = (asked in SHOTS ? asked : 'opening') as ShotName
  const [ready] = useState(() => ({
    position: [...SHOTS[at].position] as [number, number, number],
  }))
  return (
    <div className="bg-paper h-screen w-screen">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.02, far: 12, position: ready.position }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <color attach="background" args={['#F1F3F5']} />
        <Suspense fallback={null}>
          <Room at={at} held={params.has('held')} seed={Number(params.get('seed') ?? 20261106)} glass={params.get('glass') !== '0'} tube={TUBES[params.get('tube') ?? ''] ?? TUBES.app!} />
        </Suspense>
      </Canvas>
    </div>
  )
}
