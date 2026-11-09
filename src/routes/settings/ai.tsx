// SOURCING: coss ui Tabs (underline, as Twenty's AI page), Empty; the models data table (TanStack Table kitchen-sink, components/settings/models-table); @tanstack/react-query via lib/theorem/models and lib/theorem/catalog; the settings frame
import { createFileRoute } from '@tanstack/react-router'
import type { ComponentType, SVGProps } from 'react'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useCatalogEntries } from '@/lib/theorem/catalog'
import { ModelsTable } from '@/components/settings/models-table'
import { defaultModelDescription, modelCatalogIssue, useModelCatalog, usePickedModels } from '@/lib/theorem/models'
import { isNotServed } from '@/lib/theorem/passthrough'
import type { ModelOption } from '@/lib/theorem/models'

export const Route = createFileRoute('/settings/ai')({
  component: AiSettings,
})

const TABS = [
  { value: 'models', label: 'Models', Mark: Icon.Model },
  { value: 'plugins', label: 'Plugins', Mark: Icon.Plugin },
  { value: 'skills', label: 'Skills', Mark: Icon.Skill },
] as const

function AiSettings() {
  return (
    <SettingsPage
      title="AI"
      description="Every model powers Theorem with its tools and conversation context. Provider labels identify who supplies the model."
    >
      <Tabs defaultValue="models" className="gap-6">
        <TabsList
          variant="underline"
          className="w-full justify-start border-b border-separator"
        >
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

function DefaultModel({
  catalog,
  defaultRef,
}: {
  catalog: readonly ModelOption[]
  defaultRef: string | undefined
}) {
  const selected = usePickedModels((s) => s.selected)
  const select = usePickedModels((s) => s.select)
  const model = catalog.find((m) => m.ref === selected)
  const fallback = defaultModelDescription(catalog, defaultRef)
  return (
    <SettingsSection title="Default model" description="The model a new turn runs on until you pick another in the composer.">
      <SettingsBox>
        <SettingsRow
          Mark={Icon.Model}
          title={selected ? (model?.name ?? selected) : 'Default model'}
          description={selected ? selected : fallback}
        >
          {selected && (
            <Button variant="outline" size="sm" onClick={() => select(undefined)}>
              Use the default
            </Button>
          )}
        </SettingsRow>
      </SettingsBox>
    </SettingsSection>
  )
}

function ModelsTab() {
  const { data: catalog = [], list, error, isPending, refetch } = useModelCatalog()
  const issue = modelCatalogIssue(list, error)
  const starred = usePickedModels((s) => s.starred)
  const toggleStar = usePickedModels((s) => s.toggleStar)
  const selected = usePickedModels((s) => s.selected)

  return (
    <>
      {issue && <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink-muted">{issue}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry model list</Button>
      </div>}
      <DefaultModel catalog={catalog} defaultRef={list?.defaultRef} />
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
              The model list is unavailable; the configured default could not be verified.
            </EmptyDescription>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry model list</Button>
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
  items: readonly {
    id: string
    name: string
    description?: string
    plugin?: string
  }[]
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
          description={[item.plugin, item.description]
            .filter(Boolean)
            .join(' · ')}
        />
      ))}
    </SettingsBox>
  )
}

function PluginsTab() {
  const { plugins, error } = useCatalogEntries()
  return (
    <SettingsSection
      title="Plugins"
      description="Bundles of tools and skills installed in your Theorem."
    >
      {error ? (
        <p className="text-sm text-ink-muted">{describeError(error)}</p>
      ) : (
        <CatalogList
          items={plugins}
          Mark={Icon.Plugin}
          empty="No plugins installed."
        />
      )}
    </SettingsSection>
  )
}

function SkillsTab() {
  const { skills, error } = useCatalogEntries()
  return (
    <SettingsSection
      title="Skills"
      description="Instructions Theorem loads when a conversation needs them."
    >
      {error ? (
        <p className="text-sm text-ink-muted">{describeError(error)}</p>
      ) : (
        <CatalogList
          items={skills}
          Mark={Icon.Skill}
          empty="No skills available."
        />
      )}
    </SettingsSection>
  )
}
