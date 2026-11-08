// SOURCING: bun:test over the scene part reader and the frame message reader
import { expect, test } from 'bun:test'
import { readFrameMessage, readScene, SCENE_CONTRACT } from './scene-model'

const stored = {
  contractVersion: SCENE_CONTRACT,
  sceneId: 'scene:cpu',
  title: 'How does a CPU work?',
  fallbackText: 'A simplified RISC-V processor running a short program.',
  packageHash: 'a'.repeat(64),
  scenePackage: { id: 'scene:cpu', atoms: [] },
}

test('a stored scene part and a streamed one read the same', () => {
  const streamed = { ...stored, type: 'scene', partId: 'chatpart_1' }
  expect(readScene(stored)).toEqual(readScene(streamed))
  expect(readScene(stored)).toMatchObject({
    sceneId: 'scene:cpu',
    title: 'How does a CPU work?',
    scenePackage: { id: 'scene:cpu' },
  })
})

test('a part from another contract, or without a package, is not a scene', () => {
  expect(
    readScene({ ...stored, contractVersion: 'theorem-scene-v2' }),
  ).toBeUndefined()
  expect(readScene({ ...stored, scenePackage: undefined })).toBeUndefined()
  expect(readScene({ ...stored, scenePackage: [] })).toBeUndefined()
  expect(readScene({ ...stored, sceneId: ' ' })).toBeUndefined()
  expect(readScene(null)).toBeUndefined()
  expect(readScene('scene')).toBeUndefined()
})

test('an untitled scene keeps an empty fallback rather than failing', () => {
  const scene = readScene({ ...stored, title: null, fallbackText: undefined })
  expect(scene?.title).toBeUndefined()
  expect(scene?.fallbackText).toBe('')
})

test('only the scene page’s own messages are read', () => {
  expect(readFrameMessage({ type: 'sceneos:host-ready' })).toEqual({
    type: 'sceneos:host-ready',
  })
  expect(readFrameMessage({ type: 'sceneos:mounted', ok: true })).toEqual({
    type: 'sceneos:mounted',
    ok: true,
  })
  expect(readFrameMessage({ type: 'sceneos:mounted', ok: 'yes' })).toEqual({
    type: 'sceneos:mounted',
    ok: false,
  })
  expect(readFrameMessage({ type: 'sceneos:dismiss' })).toEqual({
    type: 'sceneos:dismiss',
  })
  for (const data of [
    null,
    'sceneos:host-ready',
    [],
    { type: 'sceneos:mount', package: {} },
  ]) {
    expect(readFrameMessage(data)).toBeUndefined()
  }
})
