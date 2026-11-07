// SOURCING: @puckeditor/core 0.24's createUsePuck (the page being arranged
// and the selected instance, from the editor's own store), connections.ts for
// what may connect to what. The two fields an instance's wiring is edited
// with: where each input's value comes from, and where each event goes.
import { createUsePuck } from '@puckeditor/core'
import { Plus, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type {
  Binding,
  InstanceProps,
  LayoutData,
  Route,
} from '@/lib/modules/contract'
import {
  instanceTypes,
  sourcesFor,
  targetsFor,
  validateConnections,
} from '@/lib/modules/connections'
import { findComponent } from '@/lib/modules/layout'
import { moduleById, useModuleCatalog } from '@/lib/modules/registry'
import type { ModuleDefinition } from '@/lib/modules/registry'

const usePuck = createUsePuck()

const control =
  'h-7 w-full min-w-0 rounded-md border border-separator bg-artifact px-1.5 text-xs text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** The page being arranged, the selected instance, and how to name others. */
function useWiringContext() {
  const data = usePuck((s) => s.appState.data) as unknown as LayoutData
  const selectedId = usePuck(
    (s) => s.selectedItem?.props.id as string | undefined,
  )
  const catalog = useModuleCatalog()
  const lookup = useMemo(
    () => (type: string) => moduleById(type, catalog),
    [catalog],
  )
  const types = useMemo(() => instanceTypes(data), [data])
  const nameOf = (instance: string) => {
    const title = findComponent(data, instance)?.props.title
    if (typeof title === 'string' && title) return title
    return lookup(types.get(instance) ?? '')?.label ?? instance
  }
  const problems = useMemo(
    () =>
      selectedId
        ? validateConnections(data, lookup).filter(
            (p) => p.instance === selectedId,
          )
        : [],
    [data, lookup, selectedId],
  )
  return { data, selectedId, lookup, nameOf, problems }
}

function Problem({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs text-error-ink">
      {message}
    </p>
  )
}

/** Where each of an instance's inputs reads its value from. */
export function BindingsField({
  definition,
  value,
  onChange,
}: {
  definition: ModuleDefinition
  value: InstanceProps['bind']
  onChange: (value: InstanceProps['bind']) => void
}) {
  const { data, selectedId, lookup, nameOf, problems } = useWiringContext()
  const bind = value ?? {}
  if (!selectedId) return null
  const set = (input: string, binding: Binding | undefined) => {
    const { [input]: _, ...rest } = bind
    onChange(binding ? { ...rest, [input]: binding } : rest)
  }
  return (
    <div className="flex flex-col gap-3">
      {definition.inputs.map((input) => {
        const options = sourcesFor(data, lookup, {
          instance: selectedId,
          port: input,
        })
        const current = bind[input.name]
        const key = current ? `${current.from}|${current.port}` : ''
        const known = options.some(
          (o) => `${o.instance}|${o.port.name}` === key,
        )
        const source = options.find(
          (o) => `${o.instance}|${o.port.name}` === key,
        )
        return (
          <div key={input.name} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink">
              {input.label}{' '}
              <span className="font-normal text-ink-faint">{input.type}</span>
            </span>
            <select
              aria-label={`${input.label} comes from`}
              className={control}
              value={key}
              onChange={(event) => {
                const option = options.find(
                  (o) => `${o.instance}|${o.port.name}` === event.target.value,
                )
                set(
                  input.name,
                  option && {
                    from: option.instance,
                    port: option.port.name,
                    ...(option.fit === 'convert' && { convert: true }),
                  },
                )
              }}
            >
              <option value="">Not connected</option>
              {current && !known && (
                <option value={key}>
                  {current.from} · {current.port} (not on the page)
                </option>
              )}
              {options.map((option) => (
                <option
                  key={`${option.instance}|${option.port.name}`}
                  value={`${option.instance}|${option.port.name}`}
                >
                  {nameOf(option.instance)} · {option.port.label}
                  {option.fit === 'convert' ? ` (as ${input.type})` : ''}
                </option>
              ))}
            </select>
            {current && source?.port.type === 'json' && (
              <input
                aria-label={`Part of ${source.port.label} to use`}
                placeholder="Part to use, like items.0.name"
                className={control}
                value={current.pick ?? ''}
                onChange={(event) =>
                  set(input.name, {
                    ...current,
                    pick: event.target.value || undefined,
                    convert: event.target.value ? true : current.convert,
                  })
                }
              />
            )}
            <Problem
              message={problems.find((p) => p.port === input.name)?.message}
            />
          </div>
        )
      })}
    </div>
  )
}

const routeKey = (to: Route['to']) =>
  'host' in to ? `host:${to.host}` : `to:${to.instance}|${to.action}`

/** Where each of an instance's events goes: none, one or several places. */
export function RoutesField({
  definition,
  value,
  onChange,
}: {
  definition: ModuleDefinition
  value: InstanceProps['on']
  onChange: (value: InstanceProps['on']) => void
}) {
  const { data, selectedId, lookup, nameOf, problems } = useWiringContext()
  const on = value ?? {}
  if (!selectedId) return null
  const set = (event: string, routes: Route[]) => {
    const { [event]: _, ...rest } = on
    onChange(routes.length ? { ...rest, [event]: routes } : rest)
  }
  return (
    <div className="flex flex-col gap-3">
      {definition.events.map((event) => {
        const options = targetsFor(data, lookup, {
          instance: selectedId,
          port: event,
        })
        const labelOf = (to: Route['to']) => {
          const option = options.find((o) => routeKey(o.to) === routeKey(to))
          if (!option) return null
          return 'host' in to
            ? option.label
            : `${nameOf(to.instance)} · ${option.label}`
        }
        const routes = on[event.name] ?? []
        const unused = options.filter(
          (o) => !routes.some((r) => routeKey(r.to) === routeKey(o.to)),
        )
        return (
          <div key={event.name} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink">
              {event.label}{' '}
              <span className="font-normal text-ink-faint">{event.type}</span>
            </span>
            {routes.map((route, index) => (
              <div key={routeKey(route.to)} className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-xs text-ink">
                  {labelOf(route.to) ??
                    ('host' in route.to
                      ? route.to.host
                      : `${route.to.instance} · ${route.to.action} (not on the page)`)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove"
                  onClick={() => set(event.name, routes.toSpliced(index, 1))}
                >
                  <X />
                </Button>
              </div>
            ))}
            {unused.length > 0 && (
              <div className="flex items-center gap-1">
                <Plus className="size-3 shrink-0 text-ink-faint" aria-hidden />
                <select
                  aria-label={`Send ${event.label} to`}
                  className={control}
                  value=""
                  onChange={(change) => {
                    const option = unused.find(
                      (o) => routeKey(o.to) === change.target.value,
                    )
                    if (option)
                      set(event.name, [
                        ...routes,
                        {
                          to: option.to,
                          ...(option.fit === 'convert' && { convert: true }),
                        },
                      ])
                  }}
                >
                  <option value="">Send it to…</option>
                  {unused.map((option) => (
                    <option
                      key={routeKey(option.to)}
                      value={routeKey(option.to)}
                    >
                      {'host' in option.to
                        ? option.label
                        : `${nameOf(option.to.instance)} · ${option.label}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!routes.length && !unused.length && (
              <p className="text-xs text-ink-faint">
                Nothing on the page takes a {event.type} yet.
              </p>
            )}
            <Problem
              message={problems.find((p) => p.port === event.name)?.message}
            />
          </div>
        )
      })}
    </div>
  )
}
