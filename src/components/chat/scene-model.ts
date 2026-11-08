// SOURCING: none — reads the `scene` part of the theorem-scene-v1 contract and the scene page's frame messages; plain value checks, no library fits
//
// A reply's interactive scene. Theorem's `show_scene` writes the validated
// scene package to the reply as a `scene` part (rustyred-thg-server's
// `conversation_scene`); it arrives here as the `theorem-scene` data part.
// The page that draws it is served by the authority at SCENE_HOST_PATH and
// runs in a sandboxed frame. The host posts it the package and the layout,
// and reads back only the shapes below (scene-os-web's `web/src/embed.ts`).

export const SCENE_PART = 'theorem-scene'
export const SCENE_CONTRACT = 'theorem-scene-v1'

/** Proxied to the authority's frame page (src/routes/api/scene/v1/$.ts). */
export const SCENE_HOST_PATH = '/api/scene/v1/host'

/**
 * Scripts only: the page runs in an opaque origin, so it cannot read this
 * site's storage or cookies, and its own policy forbids any network.
 */
export const SCENE_SANDBOX = 'allow-scripts'

export type Scene = {
  sceneId: string
  title?: string
  fallbackText: string
  packageHash?: string
  scenePackage: Record<string, unknown>
}

type Json = Record<string, unknown>

function object(value: unknown): Json | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

/**
 * The scene a part carries, or undefined when it is not one this client can
 * draw. A streamed part carries its own `type`; a stored one does not.
 */
export function readScene(data: unknown): Scene | undefined {
  const part = object(data)
  if (!part) return undefined
  if (part.contractVersion !== SCENE_CONTRACT) return undefined
  const sceneId = text(part.sceneId)
  const scenePackage = object(part.scenePackage)
  if (!sceneId || !scenePackage) return undefined
  return {
    sceneId,
    title: text(part.title),
    fallbackText: text(part.fallbackText) ?? '',
    packageHash: text(part.packageHash),
    scenePackage,
  }
}

export type SceneLayout = 'inline' | 'full'

export type HostMessage =
  | { type: 'sceneos:mount'; package: Record<string, unknown> }
  | { type: 'sceneos:layout'; layout: SceneLayout }

export type FrameMessage =
  | { type: 'sceneos:host-ready' }
  | { type: 'sceneos:mounted'; ok: boolean }
  | { type: 'sceneos:dismiss' }

/** A message from the scene page, or undefined for anything else. */
export function readFrameMessage(data: unknown): FrameMessage | undefined {
  const message = object(data)
  if (!message) return undefined
  switch (message.type) {
    case 'sceneos:host-ready':
    case 'sceneos:dismiss':
      return { type: message.type }
    case 'sceneos:mounted':
      return { type: 'sceneos:mounted', ok: message.ok === true }
    default:
      return undefined
  }
}
