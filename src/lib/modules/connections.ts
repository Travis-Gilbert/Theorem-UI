// SOURCING: hand-rolled. The connection rules (types checked, conversions
// explicit, no value cycles) are this app's own (docs/plans/modular-interface.md,
// "Connections"); the cycle check is a depth-first search over the page's
// instances.
import type {
  Binding,
  LayoutData,
  PortSpec,
  Route,
  ValueType,
} from './contract'
import { wiringOf } from './contract'
import { COMPOSITE_INPUT, pageComponents } from './layout'
import type { ModuleDefinition } from './registry'
import { compatibility, convert, pick } from './values'

type Lookup = (type: string) => ModuleDefinition | undefined

export type Connection =
  | { kind: 'value'; to: { instance: string; input: string }; binding: Binding }
  | { kind: 'action'; from: { instance: string; event: string }; route: Route }

/** Every binding and route on a page, read from the instances' props. */
export function connectionsOf(
  layout: Pick<LayoutData, 'content' | 'zones'>,
): Connection[] {
  const found: Connection[] = []
  for (const component of pageComponents(layout)) {
    const { bind, on } = wiringOf(component.props)
    for (const [input, binding] of Object.entries(bind))
      found.push({
        kind: 'value',
        to: { instance: component.props.id, input },
        binding,
      })
    for (const [event, routes] of Object.entries(on))
      for (const route of routes)
        found.push({
          kind: 'action',
          from: { instance: component.props.id, event },
          route,
        })
  }
  return found
}

/** Instance id to its module type, for every instance on the page. */
export function instanceTypes(layout: Pick<LayoutData, 'content' | 'zones'>) {
  return new Map(
    [...pageComponents(layout)].map((c) => [c.props.id, c.type] as const),
  )
}

/** Instances each instance reads from, by its value bindings. */
function readsFrom(layout: Pick<LayoutData, 'content' | 'zones'>) {
  const edges = new Map<string, Set<string>>()
  for (const connection of connectionsOf(layout)) {
    if (connection.kind !== 'value') continue
    const { from } = connection.binding
    if (from === COMPOSITE_INPUT) continue
    const set = edges.get(connection.to.instance) ?? new Set<string>()
    set.add(from)
    edges.set(connection.to.instance, set)
  }
  return edges
}

/** Whether `start` is reachable from `goal` by following reads. */
function reaches(
  edges: Map<string, Set<string>>,
  from: string,
  goal: string,
): boolean {
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const at = stack.pop()!
    if (at === goal) return true
    if (seen.has(at)) continue
    seen.add(at)
    for (const next of edges.get(at) ?? []) stack.push(next)
  }
  return false
}

/**
 * Whether binding an input of `target` to an output of `source` would make
 * values go round: `source` already reads, directly or not, from `target`.
 * Values only flow forward, so a page cannot loop on its own updates.
 */
export function wouldCycle(
  layout: Pick<LayoutData, 'content' | 'zones'>,
  target: string,
  source: string,
): boolean {
  return source === target || reaches(readsFrom(layout), source, target)
}

/** Instances in a value cycle, if the page (edited by hand, say) has one. */
export function findCycle(
  layout: Pick<LayoutData, 'content' | 'zones'>,
): string[] | undefined {
  const edges = readsFrom(layout)
  const state = new Map<string, 'open' | 'done'>()
  const path: string[] = []
  const visit = (node: string): string[] | undefined => {
    state.set(node, 'open')
    path.push(node)
    for (const next of edges.get(node) ?? []) {
      if (state.get(next) === 'open') return path.slice(path.indexOf(next))
      if (!state.has(next)) {
        const cycle = visit(next)
        if (cycle) return cycle
      }
    }
    path.pop()
    state.set(node, 'done')
    return undefined
  }
  for (const node of edges.keys())
    if (!state.has(node)) {
      const cycle = visit(node)
      if (cycle) return cycle
    }
  return undefined
}

/** The type a binding delivers: a pick reads into the value, so it is JSON. */
const deliveredType = (port: PortSpec, path: string | undefined): ValueType =>
  path ? 'json' : port.type

export interface ConnectionProblem {
  instance: string
  /** The input or event it concerns. */
  port: string
  message: string
}

/**
 * What is wrong with a page's wiring, if anything: a source or target that
 * is not on the page or has no such port, types that do not meet, a
 * conversion the binding does not ask for, a value cycle.
 */
export function validateConnections(
  layout: Pick<LayoutData, 'content' | 'zones'>,
  lookup: Lookup,
  composite?: { inputs: PortSpec[] },
): ConnectionProblem[] {
  const types = instanceTypes(layout)
  const problems: ConnectionProblem[] = []
  for (const connection of connectionsOf(layout)) {
    if (connection.kind === 'value') {
      const { instance, input } = connection.to
      const target = lookup(types.get(instance) ?? '')?.inputs.find(
        (p) => p.name === input,
      )
      const say = (message: string) =>
        problems.push({ instance, port: input, message })
      if (!target) {
        say(`has no input "${input}"`)
        continue
      }
      const { from, port, pick: path, convert: asks } = connection.binding
      const source =
        from === COMPOSITE_INPUT
          ? composite?.inputs.find((p) => p.name === port)
          : lookup(types.get(from) ?? '')?.outputs.find((p) => p.name === port)
      if (from !== COMPOSITE_INPUT && !types.has(from)) {
        say('reads from an instance that is no longer on the page')
        continue
      }
      if (!source) {
        say(`reads "${port}", which its source does not have`)
        continue
      }
      const fit = compatibility(deliveredType(source, path), target.type)
      if (fit === 'none') say(`gets ${source.type} but takes ${target.type}`)
      else if (fit === 'convert' && !asks)
        say(
          `gets ${deliveredType(source, path)}; the binding must say to convert it to ${target.type}`,
        )
    } else {
      const { instance, event } = connection.from
      const say = (message: string) =>
        problems.push({ instance, port: event, message })
      const source = lookup(types.get(instance) ?? '')?.events.find(
        (p) => p.name === event,
      )
      if (!source) {
        say(`has no event "${event}"`)
        continue
      }
      const { to, pick: path, convert: asks } = connection.route
      const takes: ValueType | undefined =
        'host' in to
          ? 'reference'
          : lookup(types.get(to.instance) ?? '')?.actions.find(
              (a) => a.name === to.action,
            )?.type
      if (!('host' in to) && !types.has(to.instance)) {
        say('goes to an instance that is no longer on the page')
        continue
      }
      if (!takes) {
        say('goes to an action its target does not have')
        continue
      }
      const fit = compatibility(deliveredType(source, path), takes)
      if (fit === 'none')
        say(`sends ${source.type} to an action that takes ${takes}`)
      else if (fit === 'convert' && !asks)
        say(
          `sends ${deliveredType(source, path)}; the route must say to convert it to ${takes}`,
        )
    }
  }
  const cycle = findCycle(layout)
  if (cycle)
    problems.push({
      instance: cycle[0]!,
      port: '',
      message: `values go round: ${cycle.join(' → ')}`,
    })
  return problems
}

export interface SourceOption {
  instance: string
  port: PortSpec
  fit: 'same' | 'convert'
}

/**
 * Outputs an input could be bound to: on another instance, of a type that
 * meets the input's, and not making a cycle.
 */
export function sourcesFor(
  layout: Pick<LayoutData, 'content' | 'zones'>,
  lookup: Lookup,
  target: { instance: string; port: PortSpec },
): SourceOption[] {
  const options: SourceOption[] = []
  for (const [instance, type] of instanceTypes(layout)) {
    if (wouldCycle(layout, target.instance, instance)) continue
    for (const port of lookup(type)?.outputs ?? []) {
      const fit = compatibility(port.type, target.port.type)
      if (fit !== 'none') options.push({ instance, port, fit })
    }
  }
  return options
}

/** Actions an event could go to: on any instance, or the host's. */
export function targetsFor(
  layout: Pick<LayoutData, 'content' | 'zones'>,
  lookup: Lookup,
  source: { instance: string; port: PortSpec },
): Array<{ to: Route['to']; label: string; fit: 'same' | 'convert' }> {
  const options: Array<{
    to: Route['to']
    label: string
    fit: 'same' | 'convert'
  }> = []
  const toComposer = compatibility(source.port.type, 'reference')
  if (toComposer !== 'none') {
    options.push({
      to: { host: 'composer.attach' },
      label: 'Attach to the composer',
      fit: toComposer,
    })
    options.push({
      to: { host: 'composer.ask' },
      label: 'Ask in the composer',
      fit: toComposer,
    })
  }
  for (const [instance, type] of instanceTypes(layout)) {
    if (instance === source.instance) continue
    for (const action of lookup(type)?.actions ?? []) {
      const fit = compatibility(source.port.type, action.type)
      if (fit !== 'none')
        options.push({
          to: { instance, action: action.name },
          label: action.label,
          fit,
        })
    }
  }
  return options
}

/**
 * The value a binding delivers, from the source's current value: picked,
 * then converted when the binding asks, then dropped when it is not the
 * input's type after all.
 */
export function deliver(
  value: unknown,
  source: ValueType,
  target: ValueType,
  binding: Pick<Binding, 'pick' | 'convert'>,
): unknown {
  const picked = pick(value, binding.pick)
  const from = binding.pick ? 'json' : source
  const fit = compatibility(from, target)
  if (fit === 'none') return undefined
  if (fit === 'convert' && !binding.convert) return undefined
  return convert(picked, from, target)
}
