// SOURCING: @puckeditor/core 0.24's Render (a mode's page in use, as a page
// is), Base UI useMediaQuery (the phone keeps the Index's own overlay), the
// Index's navigation (the /index URL is Index mode's place) and its library
// publication. A mode's page is `Modes/<mode>.page.json` in the vault, else
// its template (lib/modules/templates.ts); it is arranged in Pages.
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query'
import { Render } from '@puckeditor/core'
import { useMemo, useState } from 'react'
import { PhoneIndex } from '@/components/index/index-surface'
import {
  IndexPlaceContext,
  useUrlIndexPlace,
} from '@/components/index/navigation'
import { useLibraryPublication } from '@/components/index/queries'
import { Button } from '@/components/ui/button'
import { prepareLayout } from '@/lib/modules/layout'
import { moduleById, useModuleCatalog } from '@/lib/modules/registry'
import {
  useInstalledModules,
  useModePage,
  useVaultClient,
  wroteHere,
} from '@/lib/modules/store'
import type { ModePageSource } from '@/lib/modules/store'
import { modePagePath, modeTemplatePage } from '@/lib/modules/templates'
import type { PageMode } from '@/lib/modules/templates'
import type { WorkspaceClient } from '@/lib/workspace/types'
// For its effect: the built-in modules join the catalog.
import './builtins'
import { ContentRendererContext } from './module-instance'
import { PageRuntimeProvider, PageScopeProvider } from './page-runtime'
import { PageSkeleton, useContentRenderer } from './page-view'
import { LAYOUT_TYPES, usePageConfig } from './puck-config'
import type { PageMetadata } from './puck-config'

const templateSource = (mode: PageMode): ModePageSource => ({
  path: modePagePath(mode),
  page: modeTemplatePage(mode),
  hash: null,
  template: true,
})

/**
 * A mode drawn from its page, in use: no page header, and a line above it
 * only when there is something to say. Its arrangement is held; one saved
 * from this window shows at once, one from elsewhere waits behind Show it.
 */
export function ModePage({ mode }: { mode: PageMode }) {
  const { client, isPending } = useVaultClient()
  if (client) return <VaultModePage client={client} mode={mode} />
  if (isPending) return <PageSkeleton />
  return (
    <PageRuntimeProvider>
      <ModeSurface
        source={templateSource(mode)}
        notice="The vault is not open, so this is the built-in arrangement."
      />
    </PageRuntimeProvider>
  )
}

function VaultModePage({
  client,
  mode,
}: {
  client: WorkspaceClient
  mode: PageMode
}) {
  const modules = useInstalledModules(client)
  const loaded = useModePage(client, mode)
  if (loaded.error)
    return (
      <PageRuntimeProvider>
        <ModeSurface
          source={templateSource(mode)}
          notice={`${modePagePath(mode)} did not read (${loaded.error.message}), so this is the built-in arrangement.`}
        />
      </PageRuntimeProvider>
    )
  if (!loaded.data || modules.isPending) return <PageSkeleton />
  return (
    <PageRuntimeProvider>
      <ModeSurface source={loaded.data} />
    </PageRuntimeProvider>
  )
}

function ModeSurface({
  source,
  notice,
}: {
  source: ModePageSource
  notice?: string
}) {
  const [held, setHeld] = useState(source)
  const newer = source.hash !== held.hash
  if (newer && wroteHere(source.path, source.hash)) setHeld(source)
  const catalog = useModuleCatalog()
  const config = usePageConfig()
  const lookup = useMemo(
    () => (type: string) => moduleById(type, catalog),
    [catalog],
  )
  const prepared = useMemo(
    () =>
      prepareLayout(held.page.layout, lookup, (type) => LAYOUT_TYPES.has(type)),
    [held.page.layout, lookup],
  )
  const metadata = { arranging: false, page: held.path } satisfies PageMetadata
  const renderContent = useContentRenderer(config, metadata)
  const said =
    notice ??
    (held.problem &&
      `${held.problem}. This is the built-in arrangement until the file is fixed or saved again from Pages.`)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {(said || newer) && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator px-3 py-1 text-xs text-ink-muted"
        >
          {said && <span>{said}</span>}
          {newer && (
            <>
              <span>This mode's arrangement changed in the vault.</span>
              <Button variant="ghost" size="xs" onClick={() => setHeld(source)}>
                Show it
              </Button>
            </>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <ContentRendererContext.Provider value={renderContent}>
          <PageScopeProvider layout={held.page.layout}>
            <Render config={config} data={prepared} metadata={metadata} />
          </PageScopeProvider>
        </ContentRendererContext.Provider>
      </div>
    </div>
  )
}

/**
 * Index mode. On the desktop it is its page, whose Index view moves with the
 * panel beside the rail (the /index URL); below the desktop width the
 * inspector covers the view, as before.
 */
export function IndexMode() {
  // The improver composes against the library this build renders.
  useLibraryPublication()
  const place = useUrlIndexPlace()
  const desktop = useMediaQuery('(min-width: 1024px)', { noSsr: true })
  return (
    <IndexPlaceContext.Provider value={place}>
      {desktop ? <ModePage mode="index" /> : <PhoneIndex />}
    </IndexPlaceContext.Provider>
  )
}
