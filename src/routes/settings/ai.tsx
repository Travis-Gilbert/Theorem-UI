// SOURCING: coss ui Tabs (underline, as Twenty's AI page), Empty, Badge; components/settings/role-model-select (coss Combobox) for the chat, agent and decision roles from lib/theorem/roles; the models data table (TanStack Table kitchen-sink, components/settings/models-table); @tanstack/react-query via lib/theorem/models and lib/theorem/catalog; the settings frame
import { createFileRoute } from '@tanstack/react-router'
import type { ComponentType, SVGProps } from 'react'
import { Badge } from '@/components/coss/badge'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { describeError } from '@/lib/theorem/client'
import { useCatalogEntries } from '@/lib/theorem/catalog'
import { ModelsTable } from '@/components/settings/models-table'
import { RoleModelSelect } from '@/components/settings/role-model-select'
import { useModelCatalog, usePickedModels } from '@/lib/theorem/models'
import { isNotServed } from '@/lib/theorem/passthrough'
import type { ModelList, ModelOption } from '@/lib/theorem/models'
import {
  describeSource,
  describeUnavailable,
  useAgentPoolMutation,
  useRoles,
} from '@/lib/theorem/roles'
import type { RoleSource, RoleUnavailable, Roles } from '@/lib/theorem/roles'

export const Route = createFileRoute('/settings/ai')({
  component: AiSettings,
})

const TABS = [
  { value: 'models', label: 'Models', Mark: Icon.Model },
  { value: 'plugins', label: 'Plugins', Mark: Icon.Plugin },
  { value: 'skills', label: 'Skills', Mark: Icon.Article },
] as const

function AiSettings() {
  return (
    <SettingsPage title="AI" description="The models Theorem can run, and the plugins and skills it brings to a conversation.">
      <Tabs defaultValue="models" className="gap-6">
        <TabsList variant="underline" className="w-full justify-start border-b border-separator">
          {TABS.map(({ value, label, Mark }) => (
            <TabsTab key={value} value={value} className="grow-0 gap-1.5">
              <Mark className="size-3.5" />
              {label}
            </TabsTab>
          ))}
        </TabsList>
        <TabsPanel value="models" className="flex flex-col gap-8">
          <ModelsTab />
        </TabsPanel>
        <TabsPanel value="plugins">
          <PluginsTab />
        </TabsPanel>
        <TabsPanel value="skills">
          <SkillsTab />
        </TabsPanel>
      </Tabs>
    </SettingsPage>
  )
}

const DEFAULT = 'default'

/** Which model does what: chat, the agent pool, and the optional decision model. */
function RolesSection({ list }: { list: ModelList | undefined }) {
  const { data: roles, error } = useRoles()
  const models = list?.models ?? []
  const decisionModels = list?.decisionModels ?? []
  const nameOf = (ref: string) =>
    [...models, ...decisionModels].find((m) => m.ref === ref)?.name ?? ref

  return (
    <SettingsSection
      title="Roles"
      description="Which model does what. Your choices outrank your Theorem's defaults."
    >
      <SettingsBox>
        <ChatRole models={models} roles={roles} defaultRef={list?.defaultRef} nameOf={nameOf} />
        {roles && <AgentRole models={models} roles={roles} nameOf={nameOf} />}
        {roles && <DecisionRole models={decisionModels} roles={roles} nameOf={nameOf} />}
      </SettingsBox>
      {error && !isNotServed(error) && (
        <p className="px-1 text-sm text-ink-muted">{describeError(error)}</p>
      )}
    </SettingsSection>
  )
}

/** What a role runs on and where that came from, or why it cannot run. */
function RoleState({
  model,
  source,
  available = true,
  reason,
}: {
  model: string | undefined
  source?: RoleSource
  available?: boolean
  reason?: RoleUnavailable
}) {
  if (!available && reason === 'none_selected')
    return <span className="text-ink-faint">Turned off{source && `, ${describeSource(source)}`}</span>
  if (!available)
    return (
      <Badge variant="warning" className="self-start">
        {model ? `${model} ${describeUnavailable(reason)}` : 'Off'}
      </Badge>
    )
  if (!source) return <span>{model}</span>
  const from = describeSource(source)
  return model ? (
    <span>
      {model}
      <span className="text-ink-faint">, {from}</span>
    </span>
  ) : (
    <span className="text-ink-faint">{from.charAt(0).toUpperCase() + from.slice(1)}</span>
  )
}

function ChatRole({
  models,
  roles,
  defaultRef,
  nameOf,
}: {
  models: readonly ModelOption[]
  roles: Roles | undefined
  defaultRef: string | undefined
  nameOf: (ref: string) => string
}) {
  const selected = usePickedModels((s) => s.selected)
  const select = usePickedModels((s) => s.select)
  // Without /roles, the person's pick or the list's default is what runs.
  const effective = roles?.chat.model ?? selected ?? defaultRef
  return (
    <SettingsRow
      Mark={Icon.Chat}
      title="Chat"
      description={
        <span className="flex flex-col gap-0.5">
          <span>Converses with you and hands work to the agent. A pick in the composer changes it too.</span>
          <RoleState
            model={effective && nameOf(effective)}
            source={roles?.chat.source ?? (selected ? 'user' : undefined)}
            available={roles?.chat.available}
            reason={roles?.chat.reason}
          />
        </span>
      }
    >
      <RoleModelSelect
        label="Chat model"
        models={models}
        value={selected ?? DEFAULT}
        choices={[{ value: DEFAULT, label: 'Theorem default' }]}
        onChange={(ref) => select(ref === DEFAULT ? undefined : ref)}
      />
    </SettingsRow>
  )
}

function AgentRole({
  models,
  roles,
  nameOf,
}: {
  models: readonly ModelOption[]
  roles: Roles
  nameOf: (ref: string) => string
}) {
  const pool = useAgentPoolMutation()
  const { agent } = roles
  const current = pool.isPending ? pool.variables : agent.models
  const choosable = models.filter((m) => !current.includes(m.ref))
  return (
    <div>
      <SettingsRow
        Mark={Icon.Code}
        title="Agent"
        description={
          <span className="flex flex-col gap-0.5">
            <span>
              Does the work chat hands off; the mixture of models draws from this pool. Shared by your organization.
            </span>
            <RoleState
              model={undefined}
              source={agent.source}
              available={agent.available}
              reason={agent.reason}
            />
          </span>
        }
      >
        {agent.editable && (
          <RoleModelSelect
            label="Add a model to the agent pool"
            placeholder="Add a model"
            models={choosable}
            value={undefined}
            onChange={(ref) => pool.mutate([...current, ref])}
          />
        )}
      </SettingsRow>
      <ul className="flex flex-wrap gap-1.5 px-3 pb-3 ps-14" aria-label="Agent pool">
        {current.map((ref) => (
          <li
            key={ref}
            className="flex h-6 items-center gap-1 rounded-md bg-raised ps-2 pe-1 text-xs text-ink"
          >
            {nameOf(ref)}
            {agent.editable && current.length > 1 && (
              <button
                type="button"
                aria-label={`Remove ${nameOf(ref)} from the agent pool`}
                className="flex size-4 items-center justify-center rounded text-ink-muted hover:bg-hover hover:text-ink"
                disabled={pool.isPending}
                onClick={() => pool.mutate(current.filter((r) => r !== ref))}
              >
                <Icon.X className="size-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {pool.error && (
        <p className="px-3 pb-3 ps-14 text-sm text-redwood">{describeError(pool.error)}</p>
      )}
    </div>
  )
}

function DecisionRole({
  models,
  roles,
  nameOf,
}: {
  models: readonly ModelOption[]
  roles: Roles
  nameOf: (ref: string) => string
}) {
  const decision = usePickedModels((s) => s.decision)
  const pickDecision = usePickedModels((s) => s.pickDecision)
  const role = roles.decision
  return (
    <div>
      <SettingsRow
        Mark={Icon.Shuffle}
        title="Decision"
        description={
          <span className="flex flex-col gap-0.5">
            <span>
              Optional. A decision model writes no text: it answers Theorem's typed questions with calibrated
              probabilities, and some features run only with one.
            </span>
            <RoleState
              model={role.model && nameOf(role.model)}
              source={role.source}
              available={role.available}
              reason={role.reason}
            />
          </span>
        }
      >
        <RoleModelSelect
          label="Decision model"
          models={models}
          value={decision ?? DEFAULT}
          choices={[
            { value: DEFAULT, label: 'Theorem default' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(ref) => pickDecision(ref === DEFAULT ? undefined : ref)}
        />
      </SettingsRow>
      {role.features.length > 0 && (
        <ul className="flex flex-col gap-1.5 px-3 pb-3 ps-14" aria-label="Features a decision model turns on">
          {role.features.map((feature) => (
            <li key={feature.id} className="flex items-start gap-2 text-sm">
              <Badge variant={role.available ? 'success' : 'secondary'}>
                {role.available ? 'On' : 'Off'}
              </Badge>
              <span>
                {feature.label}
                <span className="text-ink-muted"> · {feature.description}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ModelsTab() {
  const { data: catalog = [], list, error, isPending } = useModelCatalog()
  const starred = usePickedModels((s) => s.starred)
  const toggleStar = usePickedModels((s) => s.toggleStar)
  const selected = usePickedModels((s) => s.selected)

  return (
    <>
      <RolesSection list={list} />
      <SettingsSection
        title="In the model picker"
        description={`Star the models you want in the composer's model picker. ${starred.length} starred${
          list?.openrouter === 'cached' ? '. OpenRouter did not answer, so this is the last list Theorem saw' : ''
        }.`}
      >
        {error ? (
          <Empty className="rounded-lg border border-separator">
            <EmptyTitle>
              {isNotServed(error) ? 'This Theorem does not list models yet' : 'Theorem did not list its models'}
            </EmptyTitle>
            <EmptyDescription>
              {isNotServed(error) ? 'Turns run on Theorem\'s default model until it does.' : describeError(error)}
            </EmptyDescription>
          </Empty>
        ) : isPending ? (
          <p className="px-1 text-sm text-ink-muted">Loading models...</p>
        ) : (
          <ModelsTable models={catalog} starred={starred} onToggleStar={toggleStar} selected={selected} />
        )}
      </SettingsSection>
    </>
  )
}

function CatalogList({
  items,
  Mark,
  empty,
}: {
  items: readonly { id: string; name: string; description?: string; plugin?: string }[]
  Mark: ComponentType<SVGProps<SVGSVGElement>>
  empty: string
}) {
  if (!items.length)
    return <p className="px-1 text-sm text-ink-muted">{empty}</p>
  return (
    <SettingsBox>
      {items.map((item) => (
        <SettingsRow
          key={item.id}
          Mark={Mark}
          title={item.name}
          description={[item.plugin, item.description].filter(Boolean).join(' · ')}
        />
      ))}
    </SettingsBox>
  )
}

function PluginsTab() {
  const { plugins, error } = useCatalogEntries()
  return (
    <SettingsSection title="Plugins" description="Bundles of tools and skills installed in your Theorem.">
      {error ? (
        <p className="text-sm text-ink-muted">{describeError(error)}</p>
      ) : (
        <CatalogList items={plugins} Mark={Icon.Plugin} empty="No plugins installed." />
      )}
    </SettingsSection>
  )
}

function SkillsTab() {
  const { skills, error } = useCatalogEntries()
  return (
    <SettingsSection title="Skills" description="Instructions Theorem loads when a conversation needs them.">
      {error ? (
        <p className="text-sm text-ink-muted">{describeError(error)}</p>
      ) : (
        <CatalogList items={skills} Mark={Icon.Article} empty="No skills available." />
      )}
    </SettingsSection>
  )
}
