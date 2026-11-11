// SOURCING: hand-rolled walks over Puck's Data shape (@puckeditor/core 0.24
// keeps a slot's children as an array of component data in the parent's
// props; its own walkTree needs the editor config, and these run on files
// before any editor exists). Placeholders, migrations and composite
// extraction are this app's own (docs/plans/modular-interface.md).
import type {
  Binding,
  ComponentData,
  InstanceProps,
  LayoutData,
  MigrationStep,
  PageDocument,
  PortSpec,
  Route,
} from './contract'
import { PAGE_SCHEMA, wiringOf } from './contract'
import type { ModuleDefinition } from './registry'

/** The component that stands in for a module this app does not have. */
export const MISSING_TYPE = 'theorem.missing'

/** The id an input binding uses for a composite's own inputs. */
export const COMPOSITE_INPUT = '@in'

export function isComponentData(value: unknown): value is ComponentData {
  if (typeof value !== 'object' || value === null) return false
  const { type, props } = value as { type?: unknown; props?: unknown }
  return (
    typeof type === 'string' &&
    typeof props === 'object' &&
    props !== null &&
    typeof (props as { id?: unknown }).id === 'string'
  )
}

const isSlot = (value: unknown): value is ComponentData[] =>
  Array.isArray(value) && value.length > 0 && value.every(isComponentData)

/** Each component in `content`, depth first, with its slot children. */
export function* components(
  content: ReadonlyArray<ComponentData>,
): Generator<ComponentData> {
  for (const component of content) {
    yield component
    for (const value of Object.values(component.props))
      if (isSlot(value)) yield* components(value)
  }
}

/** Every component on a page: its content, slots and legacy zones. */
export function* pageComponents(
  layout: Pick<LayoutData, 'content' | 'zones'>,
): Generator<ComponentData> {
  yield* components(layout.content)
  for (const zone of Object.values(layout.zones ?? {})) yield* components(zone)
}

/** `content` with each component replaced by `map`'s answer, slots too. */
export function mapComponents(
  content: ReadonlyArray<ComponentData>,
  map: (component: ComponentData) => ComponentData,
): ComponentData[] {
  return content.map((component) => {
    const mapped = map(component)
    const props: ComponentData['props'] = { ...mapped.props }
    for (const [key, value] of Object.entries(props))
      if (isSlot(value)) props[key] = mapComponents(value, map)
    return { ...mapped, props }
  })
}

export function mapLayout(
  layout: LayoutData,
  map: (component: ComponentData) => ComponentData,
): LayoutData {
  return {
    ...layout,
    content: mapComponents(layout.content, map),
    ...(layout.zones && {
      zones: Object.fromEntries(
        Object.entries(layout.zones).map(([key, zone]) => [
          key,
          mapComponents(zone, map),
        ]),
      ),
    }),
  }
}

/** Settings as `to` expects them, by the steps after `from`. */
export function migrateSettings(
  props: Record<string, unknown>,
  from: number,
  steps: ReadonlyArray<MigrationStep>,
): Record<string, unknown> {
  let next = { ...props }
  for (const step of [...steps].sort((a, b) => a.to - b.to)) {
    if (step.to <= from) continue
    for (const [old, renamed] of Object.entries(step.rename ?? {}))
      if (Object.hasOwn(next, old)) {
        next[renamed] = next[old]
        delete next[old]
      }
    for (const removed of step.remove ?? []) delete next[removed]
    next = { ...next, ...step.set }
  }
  return next
}

type Lookup = (id: string) => ModuleDefinition | undefined

/** Layout components (Split, Stack, Tabs) are not modules but are known. */
export type KnownType = (type: string) => boolean

/**
 * The layout as the editor and the page show it: a module this app does not
 * have becomes a placeholder that carries the instance untouched, and an
 * instance saved under an older module version has its settings migrated.
 */
export function prepareLayout(
  layout: LayoutData,
  lookup: Lookup,
  known: KnownType,
): LayoutData {
  return mapLayout(layout, (component) => {
    if (component.type === MISSING_TYPE) {
      // Its module may have arrived since the placeholder was made.
      const original = (component.props as { missing?: ComponentData }).missing
      if (original && isComponentData(original) && lookup(original.type))
        return prepareOne(original, lookup)
      return component
    }
    if (known(component.type)) return component
    if (!lookup(component.type))
      return {
        type: MISSING_TYPE,
        props: { id: component.props.id, missing: component },
      }
    return prepareOne(component, lookup)
  })
}

function prepareOne(component: ComponentData, lookup: Lookup): ComponentData {
  const definition = lookup(component.type)!
  const props = component.props as InstanceProps
  const from = props.v ?? 1
  if (from >= definition.version) return component
  return {
    ...component,
    props: {
      ...(migrateSettings(props, from, definition.migrations) as InstanceProps),
      id: props.id,
      v: definition.version,
    },
  }
}

/** The layout as the file keeps it: each placeholder back to what it held. */
export function restoreLayout(layout: LayoutData): LayoutData {
  return mapLayout(layout, (component) => {
    if (component.type !== MISSING_TYPE) return component
    const original = (component.props as { missing?: ComponentData }).missing
    return original && isComponentData(original) ? original : component
  })
}

export const newInstanceId = (type: string) => `${type}-${crypto.randomUUID()}`

export function newPage(title: string): PageDocument {
  return {
    schema: PAGE_SCHEMA,
    title,
    pinned: false,
    layout: { root: { props: {} }, content: [] },
  }
}

/** The subtree whose root has `id`, if any. */
export function findComponent(
  layout: Pick<LayoutData, 'content' | 'zones'>,
  id: string,
): ComponentData | undefined {
  for (const component of pageComponents(layout))
    if (component.props.id === id) return component
  return undefined
}

export interface ExtractedComposite {
  content: ComponentData[]
  inputs: PortSpec[]
  outputs: PortSpec[]
  events: PortSpec[]
  actions: PortSpec[]
  exposes: {
    outputs: Record<string, { instance: string; port: string }>
    events: Record<string, { instance: string; event: string }>
    actions: Record<string, { instance: string; action: string }>
  }
  /** The page with the subtree replaced by one instance of the composite. */
  layout: LayoutData
}

const unique = (taken: Set<string>, name: string) => {
  let candidate = name
  for (let n = 2; taken.has(candidate); n++) candidate = `${name}${n}`
  taken.add(candidate)
  return candidate
}

const portOf = (
  lookup: Lookup,
  type: string,
  list: 'inputs' | 'outputs' | 'events' | 'actions',
  name: string,
) => lookup(type)?.[list].find((port) => port.name === name)

/**
 * Turns the subtree under `rootId` into a composite module's parts:
 *
 * - an input bound from outside the subtree becomes a composite input;
 * - an output something outside reads becomes a composite output;
 * - an event routed to an instance outside becomes a composite event;
 * - an event from outside routed to an action inside becomes a composite
 *   action, handed on to the inner instance's.
 *
 * The page keeps working: the subtree is replaced by one instance of
 * `moduleId`, bound and routed as the subtree was.
 */
export function extractComposite(
  layout: LayoutData,
  rootId: string,
  moduleId: string,
  lookup: Lookup,
): ExtractedComposite | undefined {
  const root = findComponent(layout, rootId)
  if (!root) return undefined
  const inside = new Set([...components([root])].map((c) => c.props.id))
  const typeOf = new Map(
    [...pageComponents(layout)].map((c) => [c.props.id, c.type]),
  )

  const inputs: PortSpec[] = []
  const outerBind: Record<string, Binding> = {}
  const outerOn: Record<string, Route[]> = {}
  const outputs: PortSpec[] = []
  const exposedOutputs: ExtractedComposite['exposes']['outputs'] = {}
  const events: PortSpec[] = []
  const exposedEvents: ExtractedComposite['exposes']['events'] = {}
  const actions: PortSpec[] = []
  const exposedActions: ExtractedComposite['exposes']['actions'] = {}
  const names = {
    inputs: new Set<string>(),
    outputs: new Set<string>(),
    events: new Set<string>(),
    actions: new Set<string>(),
  }
  const instanceId = newInstanceId(moduleId)

  // Inside: bindings from outside become composite inputs.
  const content = mapComponents([root], (component) => {
    const { bind, on } = wiringOf(component.props)
    let changed = false
    const nextBind: Record<string, Binding> = {}
    for (const [input, value] of Object.entries(bind)) {
      if (inside.has(value.from)) {
        nextBind[input] = value
        continue
      }
      changed = true
      const port = portOf(lookup, component.type, 'inputs', input)
      const name = unique(names.inputs, input)
      inputs.push({
        name,
        label: port?.label ?? input,
        type: port?.type ?? 'json',
      })
      outerBind[name] = value
      nextBind[input] = { from: COMPOSITE_INPUT, port: name }
    }
    const nextOn: Record<string, Route[]> = {}
    for (const [event, routes] of Object.entries(on)) {
      const kept = routes.filter(
        (r) => 'host' in r.to || inside.has(r.to.instance),
      )
      const leaving = routes.filter(
        (r) => !('host' in r.to) && !inside.has(r.to.instance),
      )
      if (leaving.length) {
        changed = true
        const port = portOf(lookup, component.type, 'events', event)
        const name = unique(names.events, event)
        events.push({
          name,
          label: port?.label ?? event,
          type: port?.type ?? 'json',
        })
        exposedEvents[name] = { instance: component.props.id, event }
        outerOn[name] = leaving
      }
      if (kept.length) nextOn[event] = kept
    }
    if (!changed) return component
    return {
      ...component,
      props: { ...component.props, bind: nextBind, on: nextOn },
    }
  })

  // Outside: bindings into the subtree read the composite's outputs instead.
  const outputFor = (source: Binding) => {
    const existing = Object.entries(exposedOutputs).find(
      ([, at]) => at.instance === source.from && at.port === source.port,
    )
    if (existing) return existing[0]
    const port = portOf(
      lookup,
      typeOf.get(source.from) ?? '',
      'outputs',
      source.port,
    )
    const name = unique(names.outputs, source.port)
    outputs.push({
      name,
      label: port?.label ?? source.port,
      type: port?.type ?? 'json',
    })
    exposedOutputs[name] = { instance: source.from, port: source.port }
    return name
  }

  // Outside: routes to an action inside reach it through the composite's own.
  const actionFor = (instance: string, action: string) => {
    const existing = Object.entries(exposedActions).find(
      ([, at]) => at.instance === instance && at.action === action,
    )
    if (existing) return existing[0]
    const port = portOf(lookup, typeOf.get(instance) ?? '', 'actions', action)
    const name = unique(names.actions, action)
    actions.push({
      name,
      label: port?.label ?? action,
      type: port?.type ?? 'json',
    })
    exposedActions[name] = { instance, action }
    return name
  }

  const replacement: ComponentData = {
    type: moduleId,
    props: {
      id: instanceId,
      ...(typeof root.props.title === 'string' && { title: root.props.title }),
      bind: outerBind,
      on: outerOn,
    },
  }
  const replaced = mapLayout(
    {
      ...layout,
      content: replaceSubtree(layout.content, rootId, replacement),
      ...(layout.zones && {
        zones: Object.fromEntries(
          Object.entries(layout.zones).map(([key, zone]) => [
            key,
            replaceSubtree(zone, rootId, replacement),
          ]),
        ),
      }),
    },
    (component) => {
      if (component.props.id === instanceId) return component
      const { bind, on } = wiringOf(component.props)
      const reachesInside = (route: (typeof on)[string][number]) =>
        !('host' in route.to) && inside.has(route.to.instance)
      const rebinds = Object.values(bind).some((source) =>
        inside.has(source.from),
      )
      const retargets = Object.values(on).some((routes) =>
        routes.some(reachesInside),
      )
      if (!rebinds && !retargets) return component
      const nextBind = Object.fromEntries(
        Object.entries(bind).map(([input, source]) =>
          inside.has(source.from)
            ? [input, { ...source, from: instanceId, port: outputFor(source) }]
            : [input, source],
        ),
      )
      const nextOn = Object.fromEntries(
        Object.entries(on).map(([event, routes]) => [
          event,
          routes.map((route) =>
            reachesInside(route) && !('host' in route.to)
              ? {
                  ...route,
                  to: {
                    instance: instanceId,
                    action: actionFor(route.to.instance, route.to.action),
                  },
                }
              : route,
          ),
        ]),
      )
      return {
        ...component,
        props: { ...component.props, bind: nextBind, on: nextOn },
      }
    },
  )

  return {
    content,
    inputs,
    outputs,
    events,
    actions,
    exposes: {
      outputs: exposedOutputs,
      events: exposedEvents,
      actions: exposedActions,
    },
    layout: replaced,
  }
}

/** `content` with the component `id` swapped for `next`. */
function replaceSubtree(
  content: ReadonlyArray<ComponentData>,
  id: string,
  next: ComponentData,
): ComponentData[] {
  return content.flatMap((component) => {
    if (component.props.id === id) return [next]
    const props: ComponentData['props'] = { ...component.props }
    for (const [key, value] of Object.entries(props))
      if (isSlot(value)) props[key] = replaceSubtree(value, id, next)
    return [{ ...component, props }]
  })
}
