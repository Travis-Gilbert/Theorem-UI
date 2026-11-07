// SOURCING: React error boundaries (a module that throws shows its error in
// its own frame and the rest of the page keeps working), the page runtime
// (./page-runtime) for values and events. A composite renders its saved
// content through the same Puck Render the page uses, in a scope of its own.
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
} from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { ComponentData, InstanceProps } from '@/lib/modules/contract'
import { instanceTypes } from '@/lib/modules/connections'
import { COMPOSITE_INPUT } from '@/lib/modules/layout'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import { scoped } from '@/lib/modules/runtime'
import { cn } from '@/lib/utils'
import {
  EmptyReportContext,
  FillContext,
  SideContext,
  usePagePresentation,
  usePresentInSide,
} from './layout-parts'
import type { PagePresentation } from './layout-parts'
import {
  InstanceProvider,
  ScopeProvider,
  useInstance,
  useInstanceNotices,
  useModuleDefinition,
  usePageRuntime,
  useScope,
} from './page-runtime'
import { SandboxedModule } from './sandboxed-module'

/** Renders saved content (a composite's) with the page's own components. */
/**
 * Draws a composite's content as a page of its own, presented as the page it
 * sits in is (filling, flush), so its parts read as that page's do.
 */
export const ContentRendererContext = createContext<
  (content: ComponentData[], presentation: PagePresentation) => ReactNode
>(() => null)

class ModuleBoundary extends Component<
  { label: string; children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Module ${this.props.label} failed`,
      error,
      info.componentStack,
    )
  }
  render() {
    if (this.state.error)
      return (
        <div role="alert" className="p-3 text-sm text-error-ink">
          {this.props.label} stopped: {this.state.error.message}
        </div>
      )
    return this.props.children
  }
}

/**
 * The chrome every instance shares: its title, a notice line, its body. On a
 * flush page an instance in use has no card and no title bar, unless it has
 * actions to offer; while arranging every instance shows its title.
 */
export function ModuleFrame({
  title,
  notice,
  height,
  children,
  actions,
  arranging = false,
}: {
  title: string
  notice?: string
  height?: number
  children: ReactNode
  actions?: ReactNode
  arranging?: boolean
}) {
  const fill = useContext(FillContext)
  const flush = usePagePresentation().flush && !arranging
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden',
        !flush && 'rounded-xl border border-separator bg-artifact',
        fill && 'h-full',
      )}
      style={!fill && height ? { height } : undefined}
    >
      {(!flush || actions) && (
        <header className="flex h-8 shrink-0 items-center gap-2 border-b border-separator px-3 text-xs text-ink-muted">
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {title}
          </span>
          {actions}
        </header>
      )}
      {notice && (
        <p
          role="status"
          className="border-b border-separator bg-raised px-3 py-1.5 text-xs text-ink-muted"
        >
          {notice}
        </p>
      )}
      <div className="relative min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  )
}

/** One placed module: its frame, then its implementation. */
export function ModuleInstance({
  type,
  props,
  arranging,
}: {
  type: string
  props: InstanceProps
  arranging: boolean
}) {
  const definition = useModuleDefinition(type)
  if (!definition)
    return (
      <ModuleFrame title={props.title ?? type}>
        <p className="p-3 text-sm text-ink-muted">Loading module…</p>
      </ModuleFrame>
    )
  return (
    <PlacedModule definition={definition} props={props} arranging={arranging} />
  )
}

function PlacedModule({
  definition,
  props,
  arranging,
}: {
  definition: ModuleDefinition
  props: InstanceProps
  arranging: boolean
}) {
  const view = useInstance(definition, props, arranging)
  const runtime = usePageRuntime()
  const notice = useInstanceNotices((s) => s.notices[view.path])
  const title = props.title || definition.label
  const { implementation } = definition
  // In a side of a split, it counts towards whether the side shows; what its
  // module says about having nothing to show is its own report.
  const side = usePresentInSide(view.path)
  const report = useCallback(
    (empty: boolean) => side?.empty(view.path, empty),
    [side, view.path],
  )
  return (
    <InstanceProvider path={view.path}>
      {/* A person's pointer or key here starts this instance's next chain. */}
      <div
        className="contents"
        onPointerDownCapture={() => runtime.used(view.path)}
        onKeyDownCapture={() => runtime.used(view.path)}
      >
        <ModuleFrame
          title={title}
          notice={notice}
          arranging={arranging}
          height={definition.category === 'Composite' ? undefined : 420}
        >
          <ModuleBoundary label={title}>
            {/* A composite's parts belong to it, not to the side around it. */}
            <SideContext.Provider value={null}>
              <EmptyReportContext.Provider value={report}>
                {implementation.kind === 'builtin' && (
                  <implementation.Component {...view} />
                )}
                {implementation.kind === 'sandboxed-html' && (
                  <SandboxedModule definition={definition} view={view} />
                )}
                {implementation.kind === 'composite' && (
                  <CompositeModule definition={definition} view={view} />
                )}
              </EmptyReportContext.Provider>
            </SideContext.Provider>
          </ModuleBoundary>
        </ModuleFrame>
      </div>
    </InstanceProvider>
  )
}

/**
 * A composite: its saved instances, in a scope named by this instance's
 * path, so placing it twice keeps two sets of values. Its inputs are handed
 * in as `@in`, its exposed outputs and events handed out as its own.
 */
function CompositeModule({
  definition,
  view,
}: {
  definition: ModuleDefinition
  view: ModuleViewProps
}) {
  const runtime = usePageRuntime()
  const outer = useScope()
  const render = useContext(ContentRendererContext)
  const presentation = usePagePresentation()
  const { implementation } = definition
  const content =
    implementation.kind === 'composite' ? implementation.content : []
  const exposes =
    implementation.kind === 'composite'
      ? implementation.exposes
      : { outputs: {}, events: {}, actions: {} }
  const ancestors = outer.ancestors ?? []
  const loops = ancestors.includes(definition.id)

  const inputsKey = JSON.stringify(view.inputs)
  useEffect(() => {
    for (const port of definition.inputs)
      runtime.setOutput(
        scoped(view.path, COMPOSITE_INPUT),
        port.name,
        view.inputs[port.name],
      )
    // `inputsKey` stands for `view.inputs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, view.path, inputsKey, definition.inputs])

  const exposesKey = JSON.stringify(exposes)
  useEffect(() => {
    const publish = () => {
      const state = runtime.outputs.getState()
      for (const [name, at] of Object.entries(exposes.outputs))
        runtime.setOutput(
          view.path,
          name,
          state[scoped(view.path, at.instance)]?.[at.port],
        )
    }
    publish()
    const stops = Object.entries(exposes.events).map(([name, at]) =>
      runtime.forward(
        scoped(view.path, at.instance),
        at.event,
        view.path,
        name,
      ),
    )
    // The composite's actions hand what they are given to the inner one.
    const handles = Object.entries(exposes.actions).map(([name, at]) =>
      runtime.handle(view.path, name, (payload) =>
        runtime.act(scoped(view.path, at.instance), at.action, payload),
      ),
    )
    const unsubscribe = runtime.outputs.subscribe(publish)
    return () => {
      unsubscribe()
      stops.forEach((stop) => stop())
      handles.forEach((stop) => stop())
    }
    // `exposesKey` stands for `exposes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, view.path, exposesKey])

  if (loops)
    return (
      <p className="p-3 text-sm text-error-ink">
        {definition.label} contains itself, so it is not shown.
      </p>
    )
  return (
    <ScopeProvider
      scope={{
        path: view.path,
        types: instanceTypes({ content }),
        composite: definition,
        ancestors: [...ancestors, definition.id],
      }}
    >
      <div className="flex flex-col gap-3 p-3">
        {render(content, presentation)}
      </div>
    </ScopeProvider>
  )
}

/** A module this app does not have: the instance is kept, untouched, until it is. */
export function MissingModule({ missing }: { missing?: ComponentData }) {
  const type = missing?.type ?? 'unknown'
  const title =
    typeof missing?.props.title === 'string' ? missing.props.title : type
  return (
    <ModuleFrame title={title}>
      <div className="flex flex-col gap-2 p-3 text-sm">
        <p>
          This page uses <code className="font-mono text-xs">{type}</code>,
          which is not installed here.
        </p>
        <p className="text-ink-muted">
          Its settings and connections are kept in the page. Install the module
          or open the page where it is, and it comes back as it was.
        </p>
      </div>
    </ModuleFrame>
  )
}
