// SOURCING: zustand (useStore over the page runtime's vanilla store, with
// useShallow so an instance renders again only when a value it is bound to
// changes), the composer's references store and askAbout for the two host
// actions. The runtime itself is src/lib/modules/runtime.ts.
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { create, useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  askAbout,
  useComposerReferences,
} from '@/components/chat/composer-references'
import type {
  InstanceProps,
  LayoutData,
  PortSpec,
} from '@/lib/modules/contract'
import { wiringOf } from '@/lib/modules/contract'
import { deliver, instanceTypes } from '@/lib/modules/connections'
import { COMPOSITE_INPUT } from '@/lib/modules/layout'
import { moduleById, useModuleCatalog } from '@/lib/modules/registry'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import { createPageRuntime, scoped, sourcePath } from '@/lib/modules/runtime'
import type { ActionHandler, PageRuntime } from '@/lib/modules/runtime'

/** Notices the runtime gave an instance: a dropped event, a stopped module. */
export const useInstanceNotices = create<{ notices: Record<string, string> }>(
  () => ({ notices: {} }),
)

const RuntimeContext = createContext<PageRuntime | null>(null)

/**
 * Where an instance sits: on the page itself, or inside a composite placed
 * at `path`. `types` names the module of each instance beside it, so a
 * binding knows its source's output types while rendering.
 */
export interface Scope {
  path: string | undefined
  types: ReadonlyMap<string, string>
  /** The composite whose inner instances these are. */
  composite?: ModuleDefinition
  /** The composites this scope sits inside, outermost first. */
  ancestors?: ReadonlyArray<string>
}

const ScopeContext = createContext<Scope>({ path: undefined, types: new Map() })

/** The instance a built-in's hooks belong to. */
const InstanceContext = createContext<string | undefined>(undefined)

export function usePageRuntime(): PageRuntime {
  const runtime = useContext(RuntimeContext)
  if (!runtime) throw new Error('Modules render inside a PageRuntimeProvider')
  return runtime
}

export const useScope = () => useContext(ScopeContext)

/**
 * One runtime per page view; a new page or a reload starts a fresh one.
 *
 * A view that is hidden and shown again (React's Activity, or StrictMode in
 * development) keeps its state but runs its effects' cleanups and then the
 * effects again. So the runtime is disposed and resumed in a layout effect,
 * which runs before any instance's own effects register with it.
 */
export function PageRuntimeProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() =>
    createPageRuntime((type) => moduleById(type), {
      attach: (reference) => useComposerReferences.getState().add(reference),
      ask: askAbout,
      notice: (instance, message) =>
        useInstanceNotices.setState((s) => ({
          notices: { ...s.notices, [instance]: message },
        })),
    }),
  )
  useLayoutEffect(() => {
    runtime.resume()
    return () => runtime.dispose()
  }, [runtime])
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  )
}

export function ScopeProvider({
  scope,
  children,
}: {
  scope: Scope
  children: ReactNode
}) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

/**
 * The page's own scope: its instances by id, so a binding between two of
 * them finds its source. A composite gives its inner instances their own.
 */
export function PageScopeProvider({
  layout,
  children,
}: {
  layout: Pick<LayoutData, 'content' | 'zones'>
  children: ReactNode
}) {
  const types = useMemo(() => instanceTypes(layout), [layout])
  const scope = useMemo((): Scope => ({ path: undefined, types }), [types])
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>
}

export const useModuleDefinition = (type: string) =>
  useModuleCatalog((catalog) => moduleById(type, catalog))

/**
 * Each input's value, from the outputs its bindings read: picked, converted
 * when the binding asks, `undefined` when nothing is bound or the source has
 * nothing yet.
 */
function useInputs(
  runtime: PageRuntime,
  scope: Scope,
  inputs: ReadonlyArray<PortSpec>,
  bind: InstanceProps['bind'],
): Record<string, unknown> {
  const catalog = useModuleCatalog()
  const bound = inputs.flatMap((input) => {
    const binding = bind?.[input.name]
    if (!binding) return []
    const source =
      binding.from === COMPOSITE_INPUT
        ? scope.composite?.inputs.find((p) => p.name === binding.port)
        : moduleById(
            scope.types.get(binding.from) ?? '',
            catalog,
          )?.outputs.find((p) => p.name === binding.port)
    return source
      ? [{ input, binding, source, path: sourcePath(scope.path, binding.from) }]
      : []
  })
  const boundKey = JSON.stringify(
    bound.map((b) => [b.input, b.binding, b.source]),
  )
  const raw = useStore(
    runtime.outputs,
    useShallow((state) =>
      bound.map(({ path, binding }) => state[path]?.[binding.port]),
    ),
  )
  return useMemo(() => {
    const values: Record<string, unknown> = {}
    bound.forEach(({ input, binding, source }, i) => {
      values[input.name] = deliver(raw[i], source.type, input.type, binding)
    })
    return values
    // `raw` changes exactly when a bound value does; `bound` follows the
    // props and the catalog, which `boundKey` stands for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, boundKey])
}

/**
 * What an instance's view needs: its settings and inputs, and the functions
 * that publish its outputs and send its events. Also registers its routes,
 * so events reach the actions they are wired to.
 */
export function useInstance(
  definition: ModuleDefinition,
  props: InstanceProps,
  arranging: boolean,
): ModuleViewProps {
  const runtime = usePageRuntime()
  const scope = useScope()
  const path = scoped(scope.path, props.id)
  const { bind, on } = wiringOf(props)

  const inputs = useInputs(runtime, scope, definition.inputs, bind)
  const onKey = JSON.stringify(on)
  // The instance stays wired while its routes change, so its published
  // values stay with it; only its removal takes them.
  useEffect(
    () => runtime.wire(path, { type: definition.id, on }),
    // Routes are kept current by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime, path, definition.id],
  )
  useEffect(
    () => runtime.route(path, on),
    // `onKey` stands for `on`, which is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtime, path, onKey],
  )

  const settings = useMemo(() => {
    const values: Record<string, unknown> = {}
    for (const setting of definition.settings)
      values[setting.name] = props[setting.name] ?? setting.default
    // A bound input of the same name takes the setting's place.
    for (const [name, value] of Object.entries(inputs))
      if (name in values && value !== undefined) values[name] = value
    return values
  }, [definition.settings, props, inputs])

  const output = useMemo(
    () => (name: string, value: unknown) =>
      runtime.setOutput(path, name, value),
    [runtime, path],
  )
  const emit = useMemo(
    () => (name: string, payload: unknown) => {
      // Nothing leaves an instance while the page is being arranged.
      if (!arranging) runtime.emit(path, name, payload)
    },
    [runtime, path, arranging],
  )
  return {
    instanceId: props.id,
    path,
    settings,
    inputs,
    output,
    emit,
    arranging,
  }
}

export function InstanceProvider({
  path,
  children,
}: {
  path: string
  children: ReactNode
}) {
  return (
    <InstanceContext.Provider value={path}>{children}</InstanceContext.Provider>
  )
}

/**
 * Handles one of this instance's actions. The handler in force is the one
 * from the latest render, so it never acts on values from an earlier one.
 */
export function useModuleAction(name: string, handler: ActionHandler) {
  const runtime = usePageRuntime()
  const path = useContext(InstanceContext)
  const onAction = useEffectEvent(handler)
  useEffect(() => {
    if (!path) return
    return runtime.handle(path, name, (payload) => onAction(payload))
  }, [runtime, path, name])
}
