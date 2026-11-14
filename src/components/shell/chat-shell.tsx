// SOURCING: dockview-react via DockShell (desktop layout), the Life field under the desktop sheet (LifeSheet) seen through the side panel's frosted glass (styles.css glass-panel; under liquid glass, glass/liquid-glass with only its conversation edge curved), Base UI Drawer (phone sidebar), Base UI useMediaQuery, the shell's ModeView (assistant-ui Thread in chat mode), AgentComposer (Base UI Popover), NotePanel (Milkdown Crepe), WorkspaceFilePanel, WorkspaceCommands (the folder dialogs and their shortcuts), the agent TerminalDrawer and the tabbed SideTerminal, the Vault (React.lazy, so cosmos.gl loads only when it opens)
import type { SplitviewApi, SplitviewReadyEvent } from 'dockview-react'
import { useParams } from '@tanstack/react-router'
import { AgentComposer } from '@/components/canvas/agent-composer'
import { ContextPanel } from './sidebar'
import { DockShell } from './dock'
import { Drawer } from '@base-ui/react/drawer'
import { Icon } from '@/components/icons'
import { AppearanceDialog } from '@/components/settings/appearance-dialog'
import { LifeSheet } from '@/components/life/life-backdrop'
import { useLiquidGlass } from '@/components/glass/liquid-glass/use-liquid-glass'
import { useSurfaceMaterial } from '@/lib/appearance'
import { appearancePair } from '@/lib/appearance-policy'
import './chat-shell.css'
import { LayoutPriority, Orientation, SplitviewReact } from 'dockview-react'
import { modeLabel, navigatorMode, useShellMode } from './modes'
import { PANEL_WIDTH, useShell } from './shell-state'
import { Rail } from './rail'
import { SideTerminal } from '@/components/terminal/side-terminal'
import { TerminalDrawer } from '@/components/terminal/terminal-drawer'
import { ThreadListPrimitive, useAuiState } from '@assistant-ui/react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { WorkspaceCommands } from '@/components/workspace/workspace-commands'
import { cn } from '@/lib/utils'
import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { ModePage } from '@/components/pages/mode-page'
import { IdePageShown, OnIdePage } from '@/components/ide/ide-page'
import { IdeStatusBar } from '@/components/ide/ide-status-bar'

const VaultWorkspace = lazy(() =>
  import('@/components/vault/vault-workspace').then((module) => ({
    default: module.VaultWorkspace,
  })),
)

const iconButton = 'size-9 p-2'

function ChatHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const title = useAuiState((s) => s.threadListItem.title)
  const mode = useShellMode()
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2">
      <TooltipIconButton
        tooltip="Open sidebar"
        aria-label="Open sidebar"
        className={iconButton}
        onClick={onOpenSidebar}
      >
        <Icon.Layout className="size-[18px]" />
      </TooltipIconButton>
      <ThreadListPrimitive.New
        render={<TooltipIconButton tooltip="New chat" className={iconButton} />}
      >
        <Icon.NewChat className="size-[18px]" />
      </ThreadListPrimitive.New>
      <h1 className="min-w-0 truncate px-2 text-sm text-ink-muted">
        {mode === 'chat' ? title || 'New chat' : modeLabel(mode)}
      </h1>
      <div className="ms-auto">
        <AppearanceDialog />
      </div>
    </header>
  )
}

/** Navigation becomes an overlay without replacing the mounted conversation. */
function NavigationDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection="left">
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 bg-black/30" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-stretch justify-start">
          <Drawer.Popup
            data-appearance-part="drawer"
            className="appearance-navigation-drawer flex h-full max-w-full bg-sidebar outline-none"
          >
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            <Rail />
            <div className="min-w-0 flex-1">
              <div className="flex justify-end p-2">
                <TooltipIconButton
                  tooltip="Close navigation"
                  onClick={() => onOpenChange(false)}
                >
                  <Icon.X />
                </TooltipIconButton>
              </div>
              <GlassPanel />
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** What the dock beside the context panel shows. */
type DockRoute = { projectId: string; threadId: string | undefined }
const DockRouteContext = createContext<DockRoute | null>(null)

/**
 * A layer kept mounted while another shows. Dockview's views set visibility:
 * visible on themselves, which shows through a hidden parent, so the layer is
 * transparent as well as hidden.
 */
const HIDDEN_LAYER = 'invisible opacity-0'

/**
 * The column beside the panel: the dock, and in IDE mode the IDE's page over
 * it (by default the conversation with Theia beside it). The page loads on
 * its first visit and then stays, hidden, so Theia's editors and layout
 * survive a switch; the dock stays mounted under it for the same reason, and
 * hides while the page shows so the sheet's gradient shows through the page.
 */
function DockView() {
  const route = useContext(DockRouteContext)
  if (!route) throw new Error('DockView renders inside the desktop sheet')
  const ide = useShellMode() === 'ide'
  const [ideLoaded, setIdeLoaded] = useState(ide)
  if (ide && !ideLoaded) setIdeLoaded(true)
  return (
    <div className="relative h-full">
      {/* Dockview layers its panels with z-index; isolate keeps them under the page. */}
      <div inert={ide} className={cn('isolate h-full', ide && HIDDEN_LAYER)}>
        <DockShell projectId={route.projectId} threadId={route.threadId} />
      </div>
      {ideLoaded && (
        <div
          inert={!ide}
          className={cn('absolute inset-0', !ide && HIDDEN_LAYER)}
        >
          <OnIdePage value>
            <IdePageShown value={ide}>
              <ModePage mode="ide" />
            </IdePageShown>
          </OnIdePage>
        </div>
      )}
    </div>
  )
}
const PANEL = 'panel'

const CONVERSATION_EDGE = {
  top: false,
  right: true,
  bottom: false,
  left: false,
}

/**
 * The side panel as frosted glass: the Life field runs under the whole sheet,
 * so it shows through the panel, blurred, instead of stopping at its edge.
 * Under liquid glass it is a liquid pane attached to the window, curved
 * only along its edge toward the conversation.
 */
function GlassPanel() {
  const ref = useRef<HTMLDivElement>(null)
  const material = useSurfaceMaterial('navigation')
  const liquid = material === 'liquid'
  useLiquidGlass(ref, liquid, CONVERSATION_EDGE)
  return (
    <div
      ref={ref}
      data-appearance-part="navigation"
      data-appearance-width-role="navigation"
      data-surface-role="navigation"
      data-material={material}
      {...appearancePair('primary', 'navigation')}
      className={cn(
        'appearance-surface h-full',
        material === 'glass' && 'glass-panel',
        liquid && 'glass-panel glass-panel-liquid',
      )}
    >
      <div className="appearance-reading-plane h-full">
        <ContextPanel />
      </div>
    </div>
  )
}

const splitComponents = {
  [PANEL]: GlassPanel,
  dock: DockView,
}

/**
 * The sheet's two columns: the active mode's panel and the dock. The panel
 * keeps its width as the window resizes, can be dragged within its range and
 * closes per mode from the rail.
 */
function SheetSplit({
  onOpenSidebar,
  ...route
}: DockRoute & { onOpenSidebar: () => void }) {
  // The Vault covers the split, and the rail's button drives its own side
  // panel, so the split underneath keeps Chat's panel.
  const panelMode = navigatorMode(useShellMode())
  const panelOpen = useShell((s) => !s.panelCollapsed[panelMode])
  const [split, setSplit] = useState<SplitviewApi>()
  const host = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<{ element: HTMLElement; inShell: boolean } | null>(
    null,
  )
  const preferredWidth = useShell((s) => s.panelWidth)
  const [overlay, setOverlay] = useState(false)
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target === document.body
      )
        return
      lastFocus.current = {
        element: event.target,
        inShell: Boolean(
          host.current?.closest('.appearance-shell')?.contains(event.target),
        ),
      }
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])
  useEffect(() => {
    const element = host.current
    if (!element) return
    let frame = 0
    const measure = () => {
      frame = 0
      const root = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      )
      setOverlay(element.clientWidth - preferredWidth < 35 * root)
    }
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure)
    })
    observer.observe(element)
    observer.observe(document.documentElement)
    measure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [preferredWidth])

  const onReady = ({ api }: SplitviewReadyEvent) => {
    const panelWidth = useShell.getState().panelWidth
    api.addPanel({
      id: PANEL,
      component: PANEL,
      size: panelWidth,
      minimumSize: PANEL_WIDTH.min,
      maximumSize: PANEL_WIDTH.max,
      priority: LayoutPriority.Low,
    })
    // Without a size the dock is added by evenly redistributing every view,
    // which would widen the panel to its maximum.
    api.addPanel({
      id: 'dock',
      component: 'dock',
      size: api.width - panelWidth,
      minimumSize: 0,
      priority: LayoutPriority.High,
    })
    setSplit(api)
  }

  useEffect(() => {
    split?.getPanel(PANEL)?.api.setVisible(panelOpen && !overlay)
    const element = host.current?.querySelector<HTMLElement>('.sheet-split')
    const frame = requestAnimationFrame(() => {
      if (element) split?.layout(element.clientWidth, element.clientHeight)
      const previous = lastFocus.current
      if (!previous?.inShell) return
      const navigationHidden =
        overlay &&
        previous.element.closest('[data-appearance-part="navigation"]')
      if (
        !navigationHidden &&
        previous.element.checkVisibility({ visibilityProperty: true })
      )
        return
      if (
        document.activeElement !== document.body &&
        document.activeElement !== previous.element
      )
        return
      const shell = host.current?.closest('.appearance-shell')
      const controls = [
        ...(shell?.querySelectorAll<HTMLElement>('button,a,[role="button"]') ??
          []),
      ].filter((control) =>
        control.checkVisibility({ visibilityProperty: true }),
      )
      // A hidden navigation command hands focus to its visible counterpart,
      // otherwise to the drawer trigger (or the first docked rail command).
      const label = previous.element.getAttribute('aria-label')
      const counterpart = controls.find(
        (control) => label && control.getAttribute('aria-label') === label,
      )
      const trigger = controls.find(
        (control) => control.getAttribute('aria-label') === 'Open sidebar',
      )
      ;(counterpart ?? trigger ?? controls[0])?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [split, panelOpen, overlay])

  // The width a drag leaves the panel at is the width it reopens with.
  useEffect(() => {
    const panel = split?.getPanel(PANEL)
    if (!panel) return
    const listener = panel.api.onDidDimensionsChange(({ width }) => {
      if (panel.api.isVisible && width > 0)
        useShell.getState().setPanelWidth(width)
    })
    return () => listener.dispose()
  }, [split])

  return (
    <DockRouteContext.Provider value={route}>
      <div
        ref={host}
        className="flex h-full min-w-0 flex-col"
        data-appearance-part="shell-allocation"
      >
        {(overlay || !panelOpen) && (
          <div className="appearance-compact-header">
            <ChatHeader onOpenSidebar={onOpenSidebar} />
          </div>
        )}
        <div className="min-h-0 flex-1">
          <SplitviewReact
            className="sheet-split dockview-theme-theorem h-full w-full"
            orientation={Orientation.HORIZONTAL}
            proportionalLayout={false}
            components={splitComponents}
            onReady={onReady}
          />
        </div>
      </div>
    </DockRouteContext.Provider>
  )
}

/**
 * Desktop shell: the rail is the base, and one rounded sheet sits on it,
 * inset by --sheet-inset from the window, holding the panel and the dock.
 * The sheet lifts off the rail by a shadow in light and a glow in dark.
 * In IDE mode the IDE's page takes the dock's place beside the IDE's panel,
 * and Theia's status bar runs along the bottom of the whole sheet.
 * In Vault mode the Vault fills the sheet; it loads on its first visit and
 * then stays, hidden, so its editors and layout survive a switch, and the
 * panel and dock stay mounted under it for the same reason.
 */
function DesktopShell(route: DockRoute) {
  const mode = useShellMode()
  const { documentId } = useParams({ strict: false })
  const view = `${mode}:${route.threadId}:${documentId}`
  const [drawerView, setDrawerView] = useState<string | null>(null)
  const drawerOpen = drawerView === view
  const setDrawerOpen = (open: boolean) => setDrawerView(open ? view : null)
  if (drawerView !== null && drawerView !== view) setDrawerView(null)
  const vault = mode === 'vault'
  const ide = mode === 'ide'
  const [vaultLoaded, setVaultLoaded] = useState(vault)
  if (vault && !vaultLoaded) setVaultLoaded(true)
  return (
    <div
      data-appearance-part="shell"
      data-appearance-width-role="usable"
      className="appearance-shell flex h-full w-full [--sheet-h:calc(100dvh-2*var(--sheet-inset))] [--sheet-inset:3px]"
    >
      <div className="appearance-docked-rail" data-appearance-width-role="rail">
        <Rail collapsible />
      </div>
      <div
        className="relative my-(--sheet-inset) me-(--sheet-inset) min-w-0 flex-1"
        data-appearance-part="sheet-frame"
      >
        <div aria-hidden="true" className="lift-glow" />
        <div className="sheet relative h-full overflow-hidden rounded-xl bg-sheet shadow-sheet">
          {/* Dockview layers its panels with z-index; isolate keeps them under the Vault. */}
          <div inert={vault} className="isolate flex h-full flex-col">
            <div className="min-h-0 flex-1">
              {/* The field runs under the panel as well as the conversation,
                  while the conversation is the sheet's view. */}
              <LifeSheet active={mode === 'chat'}>
                <SheetSplit
                  {...route}
                  onOpenSidebar={() => setDrawerOpen(true)}
                />
              </LifeSheet>
            </div>
            {ide && <IdeStatusBar />}
          </div>
          {vaultLoaded && (
            <div
              inert={!vault}
              className={cn(
                'absolute inset-0 isolate flex flex-col bg-sheet',
                !vault && HIDDEN_LAYER,
              )}
            >
              <div className="appearance-vault-header shrink-0">
                <ChatHeader onOpenSidebar={() => setDrawerOpen(true)} />
              </div>
              <div className="min-h-0 flex-1">
                <Suspense>
                  <VaultWorkspace active={vault} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </div>
      <NavigationDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
/** Rail, panel, conversation and artifacts. Mounted inside TheoremRuntimeProvider. */
export function ChatShell({
  projectId,
  threadId,
}: {
  projectId: string
  threadId: string | undefined
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-rail text-ink">
      <DesktopShell projectId={projectId} threadId={threadId} />
      <AgentComposer projectId={projectId} />
      <WorkspaceCommands />
      <TerminalDrawer />
      <SideTerminal />
    </div>
  )
}

/** Full-height status for the shell before a project is available. */
export function ShellStatus({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <p className="font-heading text-[20px] font-medium">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}
