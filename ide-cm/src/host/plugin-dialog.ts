// `@tauri-apps/plugin-dialog` for a browser: a file chosen on this machine cannot be addressed by
// path on the host, so `open` offers the host workspace's own files (answered by the host) and
// `save` names a path inside the workspace.
import { currentHost, type PickOptions } from './host'

export function open(options: PickOptions & { multiple: true }): Promise<string[] | null>
export function open(options?: PickOptions & { multiple?: false }): Promise<string | null>
export function open(options: PickOptions & { multiple?: boolean }): Promise<string | string[] | null>
export function open(options: PickOptions = {}): Promise<string | string[] | null> {
  return currentHost().pick(options)
}
export const save = (options?: PickOptions) => currentHost().save(options ?? {})
export async function message(text: string): Promise<void> {
  window.alert(text)
}
export async function confirm(text: string): Promise<boolean> {
  return window.confirm(text)
}
export async function ask(text: string): Promise<boolean> {
  return window.confirm(text)
}
