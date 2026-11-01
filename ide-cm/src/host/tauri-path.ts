// `@tauri-apps/api/path` for a workspace whose files live on the host: there is no home or
// application-data directory to name, so the ones the frontend asks for are the workspace's own
// virtual root (`/<name>`, set when the host is installed) and a scratch area under it.
import { currentHost } from './host'

const root = async (): Promise<string> => String(await currentHost().invoke('host_workspace_root'))

export const homeDir = root
export const appDataDir = async () => `${await root()}/.theorem-ide`
export const appConfigDir = appDataDir
export const downloadDir = root
export const join = async (...parts: string[]): Promise<string> =>
  parts
    .filter((part) => part !== '')
    .join('/')
    .replace(/\/{2,}/g, '/')
export const sep = () => '/'
