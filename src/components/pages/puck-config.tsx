// SOURCING: @puckeditor/core 0.24's Config (components with fields,
// defaultProps and slot fields, categories for the component list). One Puck
// component per module in the catalog, two layout components whose slots
// hold instances, and the placeholder for a module this app does not have.
// The root's settings say whether the page fills the window and whether its
// instances sit in cards or flush (./layout-parts).
import type {
  ComponentConfig,
  Config,
  Field,
  Fields,
  PuckContext,
} from '@puckeditor/core'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { InstanceProps, SettingSpec } from '@/lib/modules/contract'
import { MISSING_TYPE } from '@/lib/modules/layout'
import { useWorkAvailable } from '@/components/work/settings'
import { allModules, useModuleCatalog } from '@/lib/modules/registry'
import type { ModuleDefinition } from '@/lib/modules/registry'
import { cn } from '@/lib/utils'
import { BindingsField, RoutesField } from './connection-fields'
import {
  FillContext,
  PagePresentationContext,
  Split,
  isArranging,
  rootClass,
  usePagePresentation,
} from './layout-parts'
import type { PageMetadata, SplitProps } from './layout-parts'
import { MissingModule, ModuleInstance } from './module-instance'
import { ResourceField } from './resource-field'

export { isArranging }
export type { PageMetadata }

export const SPLIT_TYPE = 'theorem.split'
export const TABS_TYPE = 'theorem.tabs'
export const LAYOUT_TYPES: ReadonlySet<string> = new Set([
  SPLIT_TYPE,
  TABS_TYPE,
])

function settingField(setting: SettingSpec): Field {
  const label = setting.label
  switch (setting.kind) {
    case 'text':
      return { type: 'text', label }
    case 'textarea':
      return { type: 'textarea', label }
    case 'number':
      return { type: 'number', label }
    case 'boolean':
      return {
        type: 'radio',
        label,
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      }
    case 'select':
      return {
        type: 'select',
        label,
        options: (setting.options ?? []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
      }
    case 'resource':
      return {
        type: 'custom',
        label,
        render: ({ value, onChange }) => (
          <ResourceField
            kind={setting.resource ?? 'file'}
            label={label}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
          />
        ),
      }
  }
}

/** A module as a Puck component: its settings as fields, its wiring too. */
function moduleComponent(definition: ModuleDefinition): ComponentConfig {
  const fields: Fields = { title: { type: 'text', label: 'Title' } }
  for (const setting of definition.settings)
    fields[setting.name] = settingField(setting)
  if (definition.inputs.length)
    fields.bind = {
      type: 'custom',
      label: 'Inputs',
      render: ({ value, onChange }) => (
        <BindingsField
          definition={definition}
          value={value as InstanceProps['bind']}
          onChange={onChange}
        />
      ),
    }
  if (definition.events.length)
    fields.on = {
      type: 'custom',
      label: 'When it sends',
      render: ({ value, onChange }) => (
        <RoutesField
          definition={definition}
          value={value as InstanceProps['on']}
          onChange={onChange}
        />
      ),
    }
  const defaultProps: Record<string, unknown> = { v: definition.version }
  for (const setting of definition.settings)
    if (setting.default !== undefined)
      defaultProps[setting.name] = setting.default
  return {
    label: definition.label,
    fields,
    defaultProps,
    render: ({ puck, editMode: _, ...props }) => (
      <ModuleInstance
        type={definition.id}
        props={props}
        arranging={isArranging(puck)}
      />
    ),
  }
}

/** A slot's content; called, not mounted, as layout-parts explains. */
type SlotRender = (props?: { className?: string }) => ReactNode

/** Each child takes an equal share of the slot's height. */
const FILL_SLOT =
  'flex size-full min-h-0 min-w-0 flex-col gap-3 [&>*]:min-h-0 [&>*]:flex-1'

const TAB_KEYS = ['A', 'B', 'C'] as const

function Tabs(
  props: Record<string, unknown> & { height: number; puck: PuckContext },
) {
  const [active, setActive] = useState(0)
  const tabs = TAB_KEYS.map((key, index) => ({
    label: String(props[`label${key}`] || `Tab ${index + 1}`),
    Slot: props[`tab${key}`] as SlotRender,
  }))
  const { fill } = usePagePresentation()
  const height = fill ? '100%' : Math.max(160, Number(props.height) || 560)
  // While arranging every tab shows, so each can take instances.
  if (isArranging(props.puck))
    return (
      <FillContext.Provider value>
        <div className="flex flex-col gap-3">
          {tabs.map(({ label, Slot }) => (
            <section
              key={label}
              className="flex flex-col gap-1.5"
              style={{ height: fill ? 400 : height }}
            >
              <h3 className="text-xs font-medium text-ink-muted">{label}</h3>
              {Slot({ className: FILL_SLOT })}
            </section>
          ))}
        </div>
      </FillContext.Provider>
    )
  return (
    <FillContext.Provider value>
      <div className="flex flex-col gap-2" style={{ height }}>
        <div role="tablist" className="flex gap-1">
          {tabs.map(({ label }, index) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs text-ink-muted hover:bg-hover',
                index === active && 'bg-raised font-medium text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tabs.map(({ label, Slot }, index) => (
          <div
            key={label}
            role="tabpanel"
            hidden={index !== active}
            className="min-h-0 flex-1"
          >
            {Slot({ className: FILL_SLOT })}
          </div>
        ))}
      </div>
    </FillContext.Provider>
  )
}

const layoutComponents: Record<string, ComponentConfig> = {
  [SPLIT_TYPE]: {
    label: 'Split',
    fields: {
      direction: {
        type: 'radio',
        label: 'Direction',
        options: [
          { label: 'Side by side', value: 'row' },
          { label: 'Stacked', value: 'column' },
        ],
      },
      ratio: { type: 'number', label: 'First share (%)', min: 10, max: 90 },
      fixed: {
        type: 'select',
        label: 'Keeps its size',
        options: [
          { label: 'Neither side', value: 'none' },
          { label: 'The first side', value: 'first' },
          { label: 'The second side', value: 'second' },
        ],
      },
      size: { type: 'number', label: 'Its size (px)', min: 120 },
      fold: {
        type: 'radio',
        label: 'Hide the second side while it has nothing to show',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      },
      height: { type: 'number', label: 'Height (px)', min: 160 },
      first: { type: 'slot' },
      second: { type: 'slot' },
    },
    defaultProps: {
      direction: 'row',
      ratio: 50,
      fixed: 'none',
      size: 400,
      fold: false,
      height: 560,
      first: [],
      second: [],
    },
    render: (props) => <Split {...(props as unknown as SplitProps)} />,
  },
  [TABS_TYPE]: {
    label: 'Tabs',
    fields: {
      labelA: { type: 'text', label: 'First tab' },
      labelB: { type: 'text', label: 'Second tab' },
      labelC: { type: 'text', label: 'Third tab' },
      height: { type: 'number', label: 'Height (px)', min: 160 },
      tabA: { type: 'slot' },
      tabB: { type: 'slot' },
      tabC: { type: 'slot' },
    },
    defaultProps: {
      labelA: 'First',
      labelB: 'Second',
      labelC: 'Third',
      height: 560,
      tabA: [],
      tabB: [],
      tabC: [],
    },
    render: (props) => (
      <Tabs {...(props as unknown as Parameters<typeof Tabs>[0])} />
    ),
  },
}

function PageRoot({
  fill,
  flush,
  children,
}: {
  fill: boolean
  flush: boolean
  children?: ReactNode
}) {
  const presentation = useMemo(() => ({ fill, flush }), [fill, flush])
  // On a page that fills the window, a module placed straight on the page
  // fills its share of it, as one in a split's side does.
  return (
    <PagePresentationContext.Provider value={presentation}>
      <FillContext.Provider value={fill}>
        <div className={rootClass(presentation)}>{children}</div>
      </FillContext.Provider>
    </PagePresentationContext.Provider>
  )
}

const missingComponent: ComponentConfig = {
  label: 'Missing module',
  fields: {},
  permissions: { duplicate: false },
  render: ({ missing }) => <MissingModule missing={missing} />,
}

/** The page's Puck config, for these modules. */
export function pageConfig(
  modules: ReadonlyArray<ModuleDefinition>,
  // The Work modules stay renderable for pages that hold them; with the
  // tracker off they are just not offered.
  offerWork = true,
): Config {
  const components: Record<string, ComponentConfig> = { ...layoutComponents }
  for (const definition of modules)
    components[definition.id] = moduleComponent(definition)
  components[MISSING_TYPE] = missingComponent
  const of = (category: ModuleDefinition['category']) =>
    modules.filter((m) => m.category === category).map((m) => m.id)
  const installed = of('Installed')
  const composite = of('Composite')
  return {
    root: {
      fields: {
        fill: {
          type: 'radio',
          label: 'Fills the window',
          options: [
            { label: 'Yes', value: true },
            { label: 'No', value: false },
          ],
        },
        frames: {
          type: 'radio',
          label: 'Modules sit',
          options: [
            { label: 'In cards', value: 'cards' },
            { label: 'Flush, as one surface', value: 'flush' },
          ],
        },
      },
      render: ({
        children,
        fill,
        frames,
      }: {
        children?: ReactNode
        fill?: unknown
        frames?: unknown
      }) => (
        <PageRoot fill={fill === true} flush={frames === 'flush'}>
          {children}
        </PageRoot>
      ),
    },
    categories: {
      layout: { title: 'Layout', components: [...LAYOUT_TYPES] },
      theorem: { title: 'Theorem', components: of('Theorem') },
      work: { title: 'Work', components: of('Work'), visible: offerWork },
      // A heading over nothing says nothing, so these show once they hold one.
      installed: {
        title: 'Installed',
        components: installed,
        visible: installed.length > 0,
      },
      composite: {
        title: 'Made from modules',
        components: composite,
        visible: composite.length > 0,
      },
      other: { title: 'Other', visible: false, components: [MISSING_TYPE] },
    },
    components,
  }
}

/** The config for the catalog as it is now, rebuilt when the catalog changes. */
export function usePageConfig(): Config {
  const catalog = useModuleCatalog()
  const work = useWorkAvailable()
  return useMemo(() => pageConfig(allModules(catalog), work), [catalog, work])
}
