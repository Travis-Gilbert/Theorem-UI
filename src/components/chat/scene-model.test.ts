// SOURCING: bun:test over the scene part reader and the frame message reader
import { expect, test } from 'bun:test'
import {
  errorLine,
  readFrameMessage,
  readScene,
  repairRequest,
  SCENE_CONTRACT,
} from './scene-model'

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
  expect(
    readFrameMessage({
      type: 'sceneos:mounted',
      ok: false,
      error: { stage: 'mount', message: 'ctx.canvas is null', line: 12, column: 4 },
    }),
  ).toEqual({
    type: 'sceneos:mounted',
    ok: false,
    error: { stage: 'mount', message: 'ctx.canvas is null', line: 12, column: 4 },
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

test('the page’s errors are read with their stage and place, or not at all', () => {
  expect(
    readFrameMessage({
      type: 'sceneos:error',
      error: { stage: 'runtime', message: 'x is not defined', line: 3 },
    }),
  ).toEqual({
    type: 'sceneos:error',
    error: { stage: 'runtime', message: 'x is not defined', line: 3 },
  })
  // A place that is not a line number is dropped; the message is kept.
  expect(
    readFrameMessage({
      type: 'sceneos:error',
      error: { stage: 'load', message: 'Unexpected token', line: '7', column: -1 },
    }),
  ).toEqual({
    type: 'sceneos:error',
    error: { stage: 'load', message: 'Unexpected token' },
  })
  for (const error of [
    undefined,
    'boom',
    { stage: 'later', message: 'boom' },
    { stage: 'runtime', message: ' ' },
  ])
    expect(readFrameMessage({ type: 'sceneos:error', error })).toBeUndefined()
  // A mount that failed without a readable error still failed.
  expect(
    readFrameMessage({ type: 'sceneos:mounted', ok: false, error: 'boom' }),
  ).toEqual({ type: 'sceneos:mounted', ok: false })
})

test('a pick names an entity, and clearing it names none', () => {
  expect(
    readFrameMessage({
      type: 'sceneos:select',
      entity: { id: 'alu', label: 'ALU', kind: 'unit', detail: 'Adds', extra: 1 },
    }),
  ).toEqual({
    type: 'sceneos:select',
    entity: { id: 'alu', label: 'ALU', kind: 'unit', detail: 'Adds' },
  })
  expect(readFrameMessage({ type: 'sceneos:select', entity: null })).toEqual({
    type: 'sceneos:select',
    entity: null,
  })
  expect(
    readFrameMessage({ type: 'sceneos:select', entity: { id: 'pc', label: 3 } }),
  ).toEqual({ type: 'sceneos:select', entity: { id: 'pc' } })
  for (const entity of [undefined, { label: 'ALU' }, { id: ' ' }, 'alu'])
    expect(readFrameMessage({ type: 'sceneos:select', entity })).toBeUndefined()
})

test('an error reads as one line, and asks for the code to be fixed', () => {
  const error = {
    stage: 'mount' as const,
    message: 'ctx.canvas is null',
    line: 12,
    column: 4,
  }
  expect(errorLine(error)).toBe('mount at line 12, column 4: ctx.canvas is null')
  expect(errorLine({ stage: 'load', message: 'Unexpected token' })).toBe(
    'load: Unexpected token',
  )
  expect(repairRequest('How does a CPU work?', error)).toBe(
    'The immersive artifact "How does a CPU work?" failed: mount at line 12, column 4: ctx.canvas is null. Fix its code and show it again.',
  )
  expect(repairRequest(undefined, error)).toContain(
    'The immersive artifact failed: mount at line 12',
  )
})
