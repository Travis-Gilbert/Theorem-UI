// SOURCING: coss ui Tabs (underline, as the AI settings page) and Empty, the settings frame; lib/theorem/response-styles (the catalog, and `isResponseStylesAbsent` for a Theorem that predates the routes)
import { useState } from 'react'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { SettingsPage } from '@/components/settings/settings-frame'
import { describeError } from '@/lib/theorem/client'
import {
  isResponseStylesAbsent,
  useResponseFramework,
  useResponseStyle,
  useResponseStyles,
} from '@/lib/theorem/response-styles'
import type { ResponseStyleCatalog } from '@/lib/theorem/response-styles'
import { DefaultsSection } from './defaults-section'
import { FrameworkEditor } from './framework-editor'
import { FrameworkList } from './framework-list'
import { StyleEditor } from './style-editor'
import { StyleList } from './style-list'
import { SuggestionsSection } from './suggestions-section'

const NEW = 'new'

/**
 * Reads one style, then hands it to an editor that keeps its own copy. Every
 * write reads the style again; a read that fails then is said beside the
 * editor, which stays up with whatever is typed in it.
 */
function OpenStyle({
  id,
  catalog,
  onBack,
  onOpen,
}: {
  id: string
  catalog: ResponseStyleCatalog
  onBack: () => void
  onOpen: (id: string) => void
}) {
  const style = useResponseStyle(id)
  if (!style.data)
    return style.error ? (
      <Problem
        title="Theorem did not open this style"
        detail={describeError(style.error)}
        onBack={onBack}
      />
    ) : (
      <Loading />
    )
  return (
    <div className="flex flex-col gap-4">
      {style.error ? (
        <Unrefreshed what="this style" error={style.error} />
      ) : null}
      <StyleEditor
        key={id}
        initial={style.data}
        frameworks={catalog.frameworks}
        onBack={onBack}
        onOpen={onOpen}
      />
    </div>
  )
}

function OpenFramework({
  id,
  onBack,
  onOpen,
}: {
  id: string
  onBack: () => void
  onOpen: (id: string) => void
}) {
  const framework = useResponseFramework(id)
  if (!framework.data)
    return framework.error ? (
      <Problem
        title="Theorem did not open this framework"
        detail={describeError(framework.error)}
        onBack={onBack}
      />
    ) : (
      <Loading />
    )
  return (
    <div className="flex flex-col gap-4">
      {framework.error ? (
        <Unrefreshed what="this framework" error={framework.error} />
      ) : null}
      <FrameworkEditor
        key={id}
        initial={framework.data}
        onBack={onBack}
        onOpen={onOpen}
      />
    </div>
  )
}

const Loading = () => <p className="text-sm text-ink-muted">Loading.</p>

/** A later read failed. What was read before stays on the page, and so does anything typed. */
function Unrefreshed({ what, error }: { what: string; error: unknown }) {
  return (
    <p role="alert" className="text-sm text-error-ink">
      Theorem could not read {what} again, so this is the last copy it gave.{' '}
      {describeError(error)}
    </p>
  )
}

function Problem({
  title,
  detail,
  onBack,
}: {
  title: string
  detail: string
  onBack: () => void
}) {
  return (
    <Empty className="rounded-lg border border-separator">
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{detail}</EmptyDescription>
      <button
        type="button"
        className="text-sm underline outline-none focus-visible:outline-2 focus-visible:outline-focus"
        onClick={onBack}
      >
        Go back
      </button>
    </Empty>
  )
}

function Panels({ catalog }: { catalog: ResponseStyleCatalog }) {
  const [tab, setTab] = useState('styles')
  const [styleId, setStyleId] = useState<string>()
  const [frameworkId, setFrameworkId] = useState<string>()
  return (
    <Tabs value={tab} onValueChange={(next) => setTab(String(next))}>
      {/* Three labels are wider than a phone: the row scrolls, the page does not.
          The underline sits one pixel below the list, hence the padding. */}
      <div className="max-w-full overflow-x-auto overflow-y-hidden pb-px">
        <TabsList variant="underline">
          <TabsTab value="styles">Styles</TabsTab>
          <TabsTab value="frameworks">Frameworks</TabsTab>
          <TabsTab value="defaults">Defaults and suggestions</TabsTab>
        </TabsList>
      </div>
      {/* Kept mounted, so text typed in an editor survives a look at another tab. */}
      <TabsPanel value="styles" keepMounted className="pt-6">
        {styleId === undefined ? (
          <StyleList
            styles={catalog.styles}
            onOpen={setStyleId}
            onNew={() => setStyleId(NEW)}
          />
        ) : styleId === NEW ? (
          <StyleEditor
            key={NEW}
            initial={undefined}
            frameworks={catalog.frameworks}
            onBack={() => setStyleId(undefined)}
            onOpen={setStyleId}
          />
        ) : (
          <OpenStyle
            id={styleId}
            catalog={catalog}
            onBack={() => setStyleId(undefined)}
            onOpen={setStyleId}
          />
        )}
      </TabsPanel>
      <TabsPanel value="frameworks" keepMounted className="pt-6">
        {frameworkId === undefined ? (
          <FrameworkList
            frameworks={catalog.frameworks}
            onOpen={setFrameworkId}
          />
        ) : (
          <OpenFramework
            id={frameworkId}
            onBack={() => setFrameworkId(undefined)}
            onOpen={setFrameworkId}
          />
        )}
      </TabsPanel>
      <TabsPanel
        value="defaults"
        keepMounted
        className="flex flex-col gap-8 pt-6"
      >
        <DefaultsSection catalog={catalog} />
        <SuggestionsSection suggestions={catalog.suggestions} />
      </TabsPanel>
    </Tabs>
  )
}

/** Settings, Response styles: the styles and frameworks, where each applies, and the decision model that suggests. */
export function ResponseStylesPage() {
  const catalog = useResponseStyles()
  return (
    <SettingsPage
      title="Response styles"
      description="A style tells Theorem how to write its answers. Edit the ones that ship, make your own, and choose where each applies."
    >
      {catalog.data ? (
        // A list read once stays up when a later read fails: the panels hold
        // editors, and taking them down would drop what is typed in them.
        <>
          {catalog.error && (
            <Unrefreshed what="the styles" error={catalog.error} />
          )}
          <Panels catalog={catalog.data} />
        </>
      ) : catalog.error ? (
        isResponseStylesAbsent(catalog.error) ? (
          <Empty className="rounded-lg border border-separator">
            <EmptyTitle>Response styles are not available here</EmptyTitle>
            <EmptyDescription>
              This Theorem does not serve response styles yet. Answers are
              written in its usual way, and nothing here needs your attention.
            </EmptyDescription>
          </Empty>
        ) : (
          <Empty className="rounded-lg border border-separator">
            <EmptyTitle>Theorem did not list its styles</EmptyTitle>
            <EmptyDescription>{describeError(catalog.error)}</EmptyDescription>
          </Empty>
        )
      ) : (
        <p className="text-sm text-ink-muted">Loading styles.</p>
      )}
    </SettingsPage>
  )
}
