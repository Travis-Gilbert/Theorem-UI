// SOURCING: none — OpenIDEA's application, project and window commands answered for a browser
// tab attached to one Theorem workspace. The tab IS the project window: its project is the
// workspace root, there is one window, and everything that would create another native window
// (new window, window groups, LightEdit, Settings window, remote development) answers as the
// unavailable state it is.

import type { Launch, OpenOutcome, ProjectInfo_Serialize, RecentProject } from '@/bindings'
import { guessOs } from '@/platform/platformInfo'
import { unavailable } from '../host'
import { LANGUAGES } from '../languages'
import { arg, isBoolean, isString, isStringArray, type CommandContext, type CommandTable } from './context'
import type { SettingsLayers } from './settings'

const APP_VERSION = '0.1.0'
const recentKey = 'theorem-ide-cm.recent-projects'
const MAX_RECENT = 10

const LOG = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
  trace: console.debug,
} as const

export interface AppOptions {
  /** Files named on the page's URL (`?file=`), opened once the project is. */
  files: string[]
}

export function appCommands(context: CommandContext, settings: SettingsLayers, options: AppOptions): CommandTable {
  const { connection } = context
  let launchTaken = false

  const readRecent = (): RecentProject[] => {
    try {
      const parsed: unknown = JSON.parse(context.storage.getItem(recentKey) ?? '[]')
      return Array.isArray(parsed) ? (parsed as RecentProject[]) : []
    } catch {
      return []
    }
  }
  const writeRecent = (recent: RecentProject[]) => {
    try {
      context.storage.setItem(recentKey, JSON.stringify(recent))
    } catch {
      /* the recent list is a convenience */
    }
  }

  const requireRoot = (path: string) => {
    if (path !== connection.root) {
      throw unavailable(
        `Opening ${path}`,
        `this tab is attached to the workspace ${connection.root}; another workspace has its own address`,
      )
    }
  }

  const project = async (): Promise<ProjectInfo_Serialize> => ({
    // Nothing from this project runs in the browser: the workspace host is the only place
    // anything executes, and it holds the sandbox. There is nothing for the page to distrust.
    trusted: true,
    root: connection.root,
    name: connection.name,
    // `isGit` turns on the version-control views, which need the `vcs_*` commands this host
    // does not answer yet (see lanes/I02.md).
    isGit: false,
    settings: (await settings.effective()) as ProjectInfo_Serialize['settings'],
  })

  return {
    app_info: async () => ({
      version: APP_VERSION,
      platform: guessOs(),
      configDir: connection.stateRoot,
    }),

    // The virtual roots the `@tauri-apps/api/path` shim names: home is the project, and the
    // application data and config directories are the caller's own state store, outside the checkout.
    host_workspace_root: async () => connection.root,
    host_state_root: async () => connection.stateRoot,

    recent_projects: async () => readRecent(),
    remove_recent_project: async (args) => {
      const path = arg(args, 'path', isString)
      writeRecent(readRecent().filter((r) => r.path !== path))
      return null
    },

    open_project: async (args) => {
      requireRoot(arg(args, 'path', isString))
      const recent: RecentProject = { path: connection.root, name: connection.name, openedAtMs: Date.now(), branch: null }
      writeRecent([recent, ...readRecent().filter((r) => r.path !== recent.path)].slice(0, MAX_RECENT))
      return project()
    },
    project_current: async () => project(),
    close_project: async () => null,
    project_roots: async () => ({ roots: [], detected: [] }),

    project_trust_status: async (args) => ({ root: arg(args, 'path', isString), trusted: true, decided: true }),
    project_trust_list: async () => ({ projects: [connection.root], locations: [], restricted: [] }),
    project_trust_set: (args) => {
      arg(args, 'trusted', isBoolean)
      throw unavailable('Changing project trust', 'nothing from the project runs in the browser; the workspace host holds the sandbox')
    },
    project_trust_remove_location: () => {
      throw unavailable('Changing project trust', 'nothing from the project runs in the browser; the workspace host holds the sandbox')
    },

    languages: async () => LANGUAGES,

    // The window the tab is, and the one project it shows.
    window_take_launch: async (): Promise<Launch | null> => {
      if (launchTaken) return null
      launchTaken = true
      return { project: connection.root, files: options.files.map((f) => connection.toAbsolute(f)), remote: null, settingsPage: null, newProjects: false }
    },
    window_open_project: async (args) => {
      requireRoot(arg(args, 'path', isString))
      if (arg(args, 'newWindow', isBoolean)) throw unavailable('A new window', 'open another browser tab on the workspace address')
      return { kind: 'current' } satisfies OpenOutcome
    },
    window_open_files: async (args) => {
      arg(args, 'files', isStringArray)
      return []
    },
    window_open_projects: async () => [{ name: connection.name, root: connection.root, current: true }],
    window_close_context: async () => ({ quitting: false, windows: 1 }),
    window_group_current: async () => [{ label: 'main', name: connection.name, root: connection.root, current: true }],
    window_set_titlebar_height: async () => null,

    // A tab has no native menu bar: the frontend configures and refreshes one on every project
    // change and does not read the answer, so nothing is wrong when there is none to update.
    menu_configure: async () => null,
    menu_refresh: async () => null,
    window_cycle: async () => null,
    window_toggle_fullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      return document.fullscreenElement !== null
    },

    window_new: () => {
      throw unavailable('A new window', 'open another browser tab on the workspace address')
    },
    window_open_settings: () => {
      // OpenIDEA opens its in-page Settings dialog when this refuses (features/settings/index.ts).
      throw unavailable('A separate Settings window', 'a browser tab has no second window, so the settings open as a dialog in this tab')
    },
    window_open_file_in_new_window: () => {
      throw unavailable('Opening a file in a new window', 'open another browser tab on the workspace address')
    },
    window_open_remote: () => {
      throw unavailable('Remote development', 'the workspace is already remote: it is the host this tab is attached to')
    },
    light_edit_open: () => {
      throw unavailable('LightEdit', 'a browser tab has no local files; open a file from the workspace')
    },
    workspace_create: () => {
      throw unavailable('Multi-project workspaces', 'a Theorem workspace is one project root')
    },
    workspace_attach: () => {
      throw unavailable('Multi-project workspaces', 'a Theorem workspace is one project root')
    },
    workspace_update: () => {
      throw unavailable('Multi-project workspaces', 'a Theorem workspace is one project root')
    },

    cancel_task: async () => false,
    log_frontend: async (args) => {
      const level = arg(args, 'level', isString) as keyof typeof LOG
      ;(LOG[level] ?? console.log)(`[ide-cm] ${arg(args, 'message', isString)}`)
      return null
    },
  }
}
