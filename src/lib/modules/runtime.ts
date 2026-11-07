// SOURCING: zustand/vanilla (one store of output values per open page, read
// by each instance through a selector over just the values it is bound to).
// Routing events, the depth and rate guards and composite scoping are this
// app's own (docs/plans/modular-interface.md, "Connections").
import type { TheoremContextReference } from '@theoremharness/sdk'
import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import type { Route } from './contract'
import { COMPOSITE_INPUT } from './layout'
import type { ModuleDefinition } from './registry'
import { deliver } from './connections'
import { sameValue } from './values'

/** An event handed on through more actions than this is dropped. */
export const MAX_EVENT_DEPTH = 8
/** An instance sending more events than this in a second is stopped. */
export const MAX_EVENTS_PER_SECOND = 30
/**
 * An event an instance sends this soon after an action reached it continues
 * that action's chain, so a loop through a module that answers later (a
 * sandboxed frame, an effect) still meets the depth limit. A person using
 * the instance in between (`used`) starts its next event afresh.
 */
export const CHAIN_WINDOW_MS = 5000

/** What the page lends its modules outside themselves. None calls a model. */
export interface RuntimeHost {
  /** Puts a reference in the composer; the person still sends the message. */
  attach: (reference: TheoremContextReference) => void
  /** Attaches a reference and puts the cursor in the composer. */
  ask: (reference: TheoremContextReference) => void
  /** Something was refused or dropped, for the instance's own notice. */
  notice?: (instance: string, message: string) => void
}

export type ActionHandler = (payload: unknown) => void

/** What one instance registered: its module and its routes. */
interface Wiring {
  type: string
  on: Record<string, Route[]>
}

type Outputs = Record<string, Record<string, unknown>>

/**
 * Joins an id inside a composite to the composite instance's path, so the
 * same composite placed twice keeps two sets of values.
 */
export const scoped = (scope: string | undefined, id: string) =>
  scope ? `${scope}/${id}` : id

/** The path a binding's `from` names, in the scope the binding sits in. */
export const sourcePath = (scope: string | undefined, from: string) =>
  from === COMPOSITE_INPUT
    ? scoped(scope, COMPOSITE_INPUT)
    : scoped(scope, from)

export interface PageRuntime {
  outputs: StoreApi<Outputs>
  setOutput: (instance: string, port: string, value: unknown) => void
  /**
   * Registers an instance and its routes; returns its removal, which takes
   * its published values with it.
   */
  wire: (instance: string, wiring: Wiring) => () => void
  /**
   * Replaces a wired instance's routes. Its published values stay: a value
   * bound elsewhere does not go blank because a route changed.
   */
  route: (instance: string, on: Wiring['on']) => void
  /** Registers a handler for one of an instance's actions. */
  handle: (
    instance: string,
    action: string,
    handler: ActionHandler,
  ) => () => void
  /**
   * A person used the instance (a pointer or a key on it): what it sends
   * next is theirs, not a reply to the last action that reached it.
   */
  used: (instance: string) => void
  /** Calls one of an instance's actions, as a route to it would. */
  act: (instance: string, action: string, payload: unknown) => void
  /** Hands an inner instance's event on as its composite's own event. */
  forward: (
    inner: string,
    event: string,
    outer: string,
    outerEvent: string,
  ) => () => void
  emit: (instance: string, event: string, payload: unknown) => void
  /**
   * Stops every route and handler; later calls do nothing until `resume`.
   * Values already published stay.
   */
  dispose: () => void
  /**
   * Takes calls again after `dispose`, for a view that was hidden and shown
   * again. Its instances register their routes and handlers afresh.
   */
  resume: () => void
}

export function createPageRuntime(
  lookup: (type: string) => ModuleDefinition | undefined,
  host: RuntimeHost,
  now: () => number = () => Date.now(),
): PageRuntime {
  const outputs = createStore<Outputs>()(() => ({}))
  const wiring = new Map<string, Wiring>()
  const handlers = new Map<string, ActionHandler>()
  const forwards = new Map<string, Array<{ outer: string; event: string }>>()
  const recent = new Map<string, number[]>()
  const stopped = new Set<string>()
  let depth = 0
  let disposed = false
  // The depth of the last action each instance was handed, and when.
  const reached = new Map<string, { depth: number; at: number }>()
  const handOn = (target: string, handler: ActionHandler, value: unknown) => {
    reached.set(target, { depth, at: now() })
    handler(value)
  }
  const carried = (instance: string) => {
    const last = reached.get(instance)
    if (!last) return 0
    if (now() - last.at < CHAIN_WINDOW_MS) return last.depth
    reached.delete(instance)
    return 0
  }

  const key = (instance: string, name: string) => `${instance}\u0000${name}`

  const setOutput = (instance: string, port: string, value: unknown) => {
    if (disposed) return
    const current = outputs.getState()[instance]
    if (current && sameValue(current[port], value)) return
    outputs.setState((state) => ({
      [instance]: { ...state[instance], [port]: value },
    }))
  }

  /** Whether the instance is within its event budget; stops it once it is not. */
  const allowed = (instance: string) => {
    if (stopped.has(instance)) return false
    const at = now()
    const window = (recent.get(instance) ?? []).filter((t) => at - t < 1000)
    window.push(at)
    recent.set(instance, window)
    if (window.length <= MAX_EVENTS_PER_SECOND) return true
    stopped.add(instance)
    host.notice?.(
      instance,
      'Stopped: it sent more events than a person could. Reload the page to start it again.',
    )
    return false
  }

  const emit = (instance: string, event: string, payload: unknown) => {
    if (disposed || !allowed(instance)) return
    // Outside a running chain, one an action started a moment ago goes on.
    const inherited = depth === 0 ? carried(instance) : 0
    if (depth + inherited >= MAX_EVENT_DEPTH) {
      host.notice?.(
        instance,
        `"${event}" was handed on too many times and was dropped.`,
      )
      return
    }
    const wired = wiring.get(instance)
    const scope = instance.includes('/')
      ? instance.slice(0, instance.lastIndexOf('/'))
      : undefined
    const from =
      (wired &&
        lookup(wired.type)?.events.find((e) => e.name === event)?.type) ??
      'json'
    depth += inherited + 1
    try {
      for (const route of wired?.on[event] ?? []) {
        if ('host' in route.to) {
          const reference = deliver(payload, from, 'reference', route)
          if (reference === undefined) continue
          const ref = reference as TheoremContextReference
          if (route.to.host === 'composer.attach') host.attach(ref)
          else host.ask(ref)
          continue
        }
        const { instance: to, action } = route.to
        const target = scoped(scope, to)
        const targetType = wiring.get(target)?.type
        const takes = targetType
          ? lookup(targetType)?.actions.find((a) => a.name === action)
          : undefined
        const handler = handlers.get(key(target, action))
        // The target left the page, or has not started yet: nothing to do.
        if (!takes || !handler) continue
        const value = deliver(payload, from, takes.type, route)
        if (value !== undefined) handOn(target, handler, value)
      }
      for (const next of forwards.get(key(instance, event)) ?? [])
        emit(next.outer, next.event, payload)
    } finally {
      depth -= inherited + 1
    }
  }

  const register = <T>(map: Map<string, T>, id: string, value: T) => {
    map.set(id, value)
    return () => {
      if (map.get(id) === value) map.delete(id)
    }
  }

  return {
    outputs,
    setOutput,
    wire: (instance, value) => {
      if (disposed) return () => undefined
      const remove = register(wiring, instance, value)
      return () => {
        remove()
        // Its values leave with it, so nothing reads a stale output.
        if (!wiring.has(instance) && !disposed)
          outputs.setState((state) => {
            const next = { ...state }
            delete next[instance]
            return next
          }, true)
      }
    },
    used: (instance) => {
      reached.delete(instance)
    },
    act: (instance, action, payload) => {
      const handler = disposed ? undefined : handlers.get(key(instance, action))
      if (handler) handOn(instance, handler, payload)
    },
    route: (instance, on) => {
      const wired = wiring.get(instance)
      if (wired && !disposed) wired.on = on
    },
    handle: (instance, action, handler) =>
      disposed
        ? () => undefined
        : register(handlers, key(instance, action), handler),
    forward: (inner, event, outer, outerEvent) => {
      const id = key(inner, event)
      const entry = { outer, event: outerEvent }
      forwards.set(id, [...(forwards.get(id) ?? []), entry])
      return () =>
        forwards.set(
          id,
          (forwards.get(id) ?? []).filter((e) => e !== entry),
        )
    },
    emit,
    dispose: () => {
      disposed = true
      wiring.clear()
      handlers.clear()
      reached.clear()
      forwards.clear()
    },
    resume: () => {
      disposed = false
    },
  }
}
