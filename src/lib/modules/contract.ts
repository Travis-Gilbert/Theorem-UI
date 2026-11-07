// SOURCING: zod (every module and page file is parsed before use; both are
// written by people and agents alike), Puck's Data shape (@puckeditor/core
// 0.24: `root`, `content`, `zones`, components as `{type, props: {id}}`) for a
// page's layout, so the file is exactly what the editor reads and writes. The
// module and connection model is this app's own (docs/plans/modular-interface.md).
import { z } from 'zod'

/**
 * What flows between modules. `item` is something the person can point at
 * (an Index document, a record, a file), `reference` is a conversation
 * context reference, `json` is anything else.
 */
export const VALUE_TYPES = [
  'text',
  'number',
  'boolean',
  'json',
  'item',
  'reference',
] as const
export type ValueType = (typeof VALUE_TYPES)[number]
export const valueType = z.enum(VALUE_TYPES)

/** Something in Theorem a module can point at. */
export interface Item {
  id: string
  label?: string
  /** `document`, `record`, `file`, ... */
  kind?: string
  /** A TheoremResource, when the item has one. */
  resource?: Record<string, unknown>
}

/** A module, setting, port or instance name: a short identifier. */
export const identifier = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'a camelCase name')
  .max(48)

/** A module id: reverse-DNS words, `theorem.` reserved for built-ins. */
export const moduleId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/, 'a dotted id like acme.notes')
  .max(96)

/** Instance props the host owns; a module's settings may not use them. */
export const RESERVED_PROPS = [
  'id',
  'title',
  'v',
  'bind',
  'on',
  'children',
  'puck',
  'editMode',
] as const

const port = z.object({
  name: identifier,
  label: z.string().min(1).max(80),
  type: valueType,
  description: z.string().max(400).optional(),
})
export type PortSpec = z.infer<typeof port>

/**
 * A resource a setting chooses: which Index view, object, file, App or
 * conversation an instance shows.
 */
export const RESOURCE_KINDS = [
  'index-view',
  'object-type',
  'file',
  'app',
  'conversation',
] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

const setting = z.object({
  name: identifier.refine(
    (name) => !(RESERVED_PROPS as readonly string[]).includes(name),
    'a name the host does not use',
  ),
  label: z.string().min(1).max(80),
  kind: z.enum(['text', 'textarea', 'number', 'boolean', 'select', 'resource']),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  resource: z.enum(RESOURCE_KINDS).optional(),
  default: z.json().optional(),
  description: z.string().max(400).optional(),
})
export type SettingSpec = z.infer<typeof setting>

/**
 * One step from an older settings shape to `to`. Declarative, so a module
 * installed as files can carry its own and the host can apply it.
 */
const migration = z.object({
  to: z.number().int().min(2),
  rename: z.record(z.string(), z.string()).optional(),
  remove: z.array(z.string()).optional(),
  set: z.record(z.string(), z.json()).optional(),
})
export type MigrationStep = z.infer<typeof migration>

/** What a sandboxed module asks to reach. Asking is not being granted. */
export const requestedCapabilities = z.object({
  read: z.array(z.string()).default([]),
  write: z.array(z.string()).default([]),
  state: z.array(z.string()).default([]),
  net: z.array(z.string().regex(/^[a-z0-9.-]+(:\d+)?$/i)).default([]),
})
export type RequestedCapabilities = z.infer<typeof requestedCapabilities>

/** Where an input's value comes from: another instance's output, on this page. */
export const binding = z.object({
  /** The source instance, or `@in` for the composite's own input. */
  from: z.string().min(1),
  port: identifier,
  /** A dot path into the value, `item.label`, `0.id`. */
  pick: z.string().max(200).optional(),
  /** Set when the source's type differs from the input's: convert it. */
  convert: z.boolean().optional(),
})
export type Binding = z.infer<typeof binding>

/** Host actions an event may reach. None of them calls a model. */
export const HOST_ACTIONS = ['composer.attach', 'composer.ask'] as const
export type HostAction = (typeof HOST_ACTIONS)[number]

/** Where an event goes: an action of another instance, or the host. */
export const route = z.object({
  to: z.union([
    z.object({ instance: z.string().min(1), action: identifier }),
    z.object({ host: z.enum(HOST_ACTIONS) }),
  ]),
  pick: z.string().max(200).optional(),
  convert: z.boolean().optional(),
})
export type Route = z.infer<typeof route>

/** Puck's component data: `{type, props: {id, ...}}`, slots as nested arrays. */
export const componentData: z.ZodType<ComponentData> = z.lazy(() =>
  z.looseObject({
    type: z.string().min(1),
    props: z.looseObject({ id: z.string().min(1) }),
  }),
)
export interface ComponentData {
  type: string
  props: { id: string; [key: string]: unknown }
  [key: string]: unknown
}

/** Puck's Data: the page's root props, its content, and legacy zones. */
export const layoutData = z.object({
  root: z.looseObject({ props: z.record(z.string(), z.unknown()).optional() }),
  content: z.array(componentData),
  zones: z.record(z.string(), z.array(componentData)).optional(),
})
export type LayoutData = z.infer<typeof layoutData>

/** How a composite's inner instances surface as the composite's own ports. */
const exposes = z.object({
  outputs: z
    .record(identifier, z.object({ instance: z.string(), port: identifier }))
    .default({}),
  events: z
    .record(identifier, z.object({ instance: z.string(), event: identifier }))
    .default({}),
  /** An action of the composite's, handed to the inner instance's own. */
  actions: z
    .record(identifier, z.object({ instance: z.string(), action: identifier }))
    .default({}),
})

const implementation = z.discriminatedUnion('kind', [
  /** An HTML page in the module's folder, run in an opaque-origin frame. */
  z.object({
    kind: z.literal('sandboxed-html'),
    entry: z
      .string()
      .regex(/^[\w-]+(\/[\w-]+)*\.html$/)
      .default('index.html'),
  }),
  /** Instances of other modules, wired together, saved as one. */
  z.object({
    kind: z.literal('composite'),
    content: z.array(componentData),
    exposes: exposes.default({ outputs: {}, events: {}, actions: {} }),
  }),
])

export const MODULE_SCHEMA = 'theorem.module/1'

/** `Modules/<folder>/module.json` in the vault. */
export const moduleManifest = z.object({
  schema: z.literal(MODULE_SCHEMA),
  id: moduleId.refine(
    (id) => !id.startsWith('theorem.'),
    'theorem.* ids are built in',
  ),
  version: z.number().int().min(1).default(1),
  label: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  settings: z.array(setting).default([]),
  inputs: z.array(port).default([]),
  outputs: z.array(port).default([]),
  events: z.array(port).default([]),
  actions: z.array(port).default([]),
  capabilities: requestedCapabilities.default({
    read: [],
    write: [],
    state: [],
    net: [],
  }),
  migrations: z.array(migration).default([]),
  implementation,
})
export type ModuleManifest = z.infer<typeof moduleManifest>
export type ModuleImplementation = ModuleManifest['implementation']

export const PAGE_SCHEMA = 'theorem.page/1'
/** A page file's name ends so: `Pages/Desk.page.json`. */
export const PAGE_SUFFIX = '.page.json'

/** `Pages/<name>.page.json` in the vault. */
export const pageDocument = z.object({
  schema: z.literal(PAGE_SCHEMA),
  title: z.string().min(1).max(120),
  /** Listed first in Pages. */
  pinned: z.boolean().default(false),
  /** The Puck layout, with each instance's settings and wiring in its props. */
  layout: layoutData,
})
export type PageDocument = z.infer<typeof pageDocument>

/** An instance's props, as the host reads them from the layout. */
export interface InstanceProps {
  id: string
  title?: string
  /** The module version its settings were saved under. */
  v?: number
  bind?: Record<string, Binding>
  on?: Record<string, Route[]>
  [setting: string]: unknown
}

const instanceWiring = z.object({
  bind: z.record(z.string(), binding).optional(),
  on: z.record(z.string(), z.array(route)).optional(),
})

/** An instance's wiring, or nothing for wiring that does not parse. */
export function wiringOf(props: Record<string, unknown>): {
  bind: Record<string, Binding>
  on: Record<string, Route[]>
} {
  const parsed = instanceWiring.safeParse({ bind: props.bind, on: props.on })
  return parsed.success
    ? { bind: parsed.data.bind ?? {}, on: parsed.data.on ?? {} }
    : { bind: {}, on: {} }
}

/** zod's first problem, as a sentence naming where it is. */
export function describeIssues(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'it does not parse'
  const at = issue.path.length ? `${issue.path.join('.')}: ` : ''
  return `${at}${issue.message}`
}

export class ModuleFileError extends Error {
  constructor(
    readonly path: string,
    detail: string,
  ) {
    super(`${path}: ${detail}`)
    this.name = 'ModuleFileError'
  }
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ModuleFileError(path, 'it is not JSON')
  }
}

export function parseManifest(path: string, text: string): ModuleManifest {
  const result = moduleManifest.safeParse(parseJson(path, text))
  if (!result.success)
    throw new ModuleFileError(path, describeIssues(result.error))
  return result.data
}

export function parsePage(path: string, text: string): PageDocument {
  const result = pageDocument.safeParse(parseJson(path, text))
  if (!result.success)
    throw new ModuleFileError(path, describeIssues(result.error))
  return result.data
}

/** A page file's text: stable key order, two-space indent, trailing newline. */
export const pageText = (page: PageDocument) =>
  `${JSON.stringify(page, null, 2)}\n`

export const manifestText = (manifest: ModuleManifest) =>
  `${JSON.stringify(manifest, null, 2)}\n`
