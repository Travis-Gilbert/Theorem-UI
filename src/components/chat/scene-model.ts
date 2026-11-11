// SOURCING: none — reads the `scene` part of the theorem-scene-v1 contract and the scene page's frame messages; plain value checks, no library fits
//
// A reply's interactive scene. Theorem's `show_scene` writes the validated
// scene package to the reply as a `scene` part (rustyred-thg-server's
// `conversation_scene`); it arrives here as the `theorem-scene` data part.
// The page that draws it is served by the authority at SCENE_HOST_PATH and
// runs in a sandboxed frame. The host posts it the package, the theme, whether
// it takes questions about a part, and the layout, and reads back only the
// shapes below (scene-os-web's `web/src/embed.ts`).

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

/**
 * The conversation's colours and type, which an immersive artifact draws
 * with so it matches the reply around it (scene-os-web's `web/src/theme.ts`).
 * A token the browser could not resolve is left out; the page fills it in.
 */
export type SceneTheme = Partial<{
  colorScheme: 'light' | 'dark'
  background: string
  surface: string
  foreground: string
  muted: string
  border: string
  accent: string
  accentForeground: string
  success: string
  warning: string
  danger: string
  fontFamily: string
  monoFamily: string
}>

/** Where the agent's code failed, as the page reports it, for the model to fix. */
export type ModuleError = {
  stage: 'load' | 'mount' | 'first-frame' | 'runtime'
  message: string
  line?: number
  column?: number
}

/** What the reader picked in a scene. */
export type SceneEntity = {
  id: string
  label?: string
  kind?: string
  detail?: string
}

export type HostMessage =
  | {
      type: 'sceneos:mount'
      package: Record<string, unknown>
      theme: SceneTheme
      /**
       * The host takes questions about a part: the page puts an Ask action
       * on the callout it draws on the picked part.
       */
      ask: boolean
    }
  | { type: 'sceneos:layout'; layout: SceneLayout }

export type FrameMessage =
  | { type: 'sceneos:host-ready' }
  | { type: 'sceneos:mounted'; ok: boolean; error?: ModuleError }
  | { type: 'sceneos:error'; error: ModuleError }
  | { type: 'sceneos:select'; entity: SceneEntity | null }
  | { type: 'sceneos:ask'; entity: SceneEntity }
  | { type: 'sceneos:dismiss' }

const STAGES: readonly ModuleError['stage'][] = [
  'load',
  'mount',
  'first-frame',
  'runtime',
]

function place(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : undefined
}

function readError(value: unknown): ModuleError | undefined {
  const error = object(value)
  const stage = STAGES.find((s) => s === error?.stage)
  const message = text(error?.message)
  if (!error || !stage || !message) return undefined
  const line = place(error.line)
  const column = place(error.column)
  return {
    stage,
    message,
    ...(line !== undefined && { line }),
    ...(column !== undefined && { column }),
  }
}

function readEntity(value: unknown): SceneEntity | undefined {
  const entity = object(value)
  const id = text(entity?.id)
  if (!entity || !id) return undefined
  const label = text(entity.label)
  const kind = text(entity.kind)
  const detail = text(entity.detail)
  return {
    id,
    ...(label && { label }),
    ...(kind && { kind }),
    ...(detail && { detail }),
  }
}

/** A message from the scene page, or undefined for anything else. */
export function readFrameMessage(data: unknown): FrameMessage | undefined {
  const message = object(data)
  if (!message) return undefined
  switch (message.type) {
    case 'sceneos:host-ready':
    case 'sceneos:dismiss':
      return { type: message.type }
    case 'sceneos:mounted': {
      const ok = message.ok === true
      const error = ok ? undefined : readError(message.error)
      return { type: 'sceneos:mounted', ok, ...(error && { error }) }
    }
    case 'sceneos:error': {
      const error = readError(message.error)
      return error && { type: 'sceneos:error', error }
    }
    case 'sceneos:select': {
      if (message.entity === null) return { type: 'sceneos:select', entity: null }
      const entity = readEntity(message.entity)
      return entity && { type: 'sceneos:select', entity }
    }
    case 'sceneos:ask': {
      const entity = readEntity(message.entity)
      return entity && { type: 'sceneos:ask', entity }
    }
    default:
      return undefined
  }
}

/** One line: stage, place, message, as the page shows it. */
export function errorLine(error: ModuleError): string {
  const where =
    error.line === undefined
      ? ''
      : ` at line ${error.line}${error.column === undefined ? '' : `, column ${error.column}`}`
  return `${error.stage}${where}: ${error.message}`
}

/** The message Fix sends: the agent wrote the code, so it is asked to mend it. */
export function repairRequest(
  title: string | undefined,
  error: ModuleError,
): string {
  const name = title ? ` "${title}"` : ''
  return `The immersive artifact${name} failed: ${errorLine(error)}. Fix its code and show it again.`
}
