// `@tauri-apps/api/path` for a workspace whose files live on the host: there is no home
// directory to name, so home is the workspace's own virtual root (`/<name>`), and the application
// data and config directories are the caller's own state store on the host (`/<name>.ide-state`,
// `root: "state"`), which the checkout never holds.
import { currentHost } from './host'

const root = async (): Promise<string> => String(await currentHost().invoke('host_workspace_root'))
const stateRoot = async (): Promise<string> => String(await currentHost().invoke('host_state_root'))

export const homeDir = root
export const appDataDir = stateRoot
export const appConfigDir = stateRoot
export const downloadDir = root
export const join = async (...parts: string[]): Promise<string> =>
  parts
    .filter((part) => part !== '')
    .join('/')
    .replace(/\/{2,}/g, '/')
export const sep = () => '/'
