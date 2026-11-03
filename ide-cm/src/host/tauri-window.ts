// `@tauri-apps/api/window`, `webviewWindow` and `webview` for a browser tab: the behaviours a tab
// has (title, zoom, unload guard, resize events) are real; the ones only a desktop window has
// (minimize, maximize, edge dragging, background colour) are counted refusals instead of
// pretending, and the frontend only asks for them when the platform says its window is frameless.
import { currentHost, refusalError } from './host'
import { listen as listenEvent, emit as emitEvent, type EventCallback, type UnlistenFn } from './tauri-event'

/** What the webview reports when files are dragged over it; a tab is never given one. */
export type DragDropEvent = {
  event: string
  id: number
  payload:
    | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
    | { type: 'over'; position: { x: number; y: number } }
    | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
    | { type: 'leave' }
}

const notInATab = (feature: string, what: string) =>
  Promise.reject(refusalError(currentHost().refuse(`window.${feature}`, what, 'a browser tab has the browser’s own window')))

class BrowserWindow {
  get label(): string {
    return currentHost().window.label
  }
  setTitle(title: string): Promise<void> {
    currentHost().window.setTitle(title)
    return Promise.resolve()
  }
  close(): Promise<void> {
    return currentHost().window.close()
  }
  isMaximized(): Promise<boolean> {
    return Promise.resolve(false)
  }
  isFullscreen(): Promise<boolean> {
    return Promise.resolve(document.fullscreenElement !== null)
  }
  isMinimized(): Promise<boolean> {
    return Promise.resolve(false)
  }
  isFocused(): Promise<boolean> {
    return Promise.resolve(currentHost().window.isFocused())
  }
  setFocus(): Promise<void> {
    window.focus()
    return Promise.resolve()
  }
  minimize = () => notInATab('minimize', 'Minimizing the window')
  unminimize = () => notInATab('unminimize', 'Restoring the window')
  toggleMaximize = () => notInATab('toggleMaximize', 'Maximizing the window')
  maximize = () => notInATab('maximize', 'Maximizing the window')
  unmaximize = () => notInATab('unmaximize', 'Restoring the window')
  startDragging = () => notInATab('startDragging', 'Dragging the window')
  startResizeDragging = (_dir: string) => notInATab('startResizeDragging', 'Resizing the window by its edge')
  setBackgroundColor = (_color: unknown) => notInATab('setBackgroundColor', 'Setting the window background colour')
  async onResized(handler: () => void): Promise<UnlistenFn> {
    return currentHost().window.onResized(handler)
  }
  async onCloseRequested(handler: (event: { preventDefault(): void }) => void | Promise<void>): Promise<UnlistenFn> {
    return currentHost().window.onCloseRequested(handler)
  }
  listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    return listenEvent<T>(event, handler)
  }
  emit(event: string, payload?: unknown): Promise<void> {
    return emitEvent(event, payload)
  }
  setZoom(factor: number): Promise<void> {
    currentHost().window.setZoom(factor)
    return Promise.resolve()
  }
  /**
   * Files dropped on the page: the browser gives file contents, not paths on the workspace host,
   * so none are reported. The host refuses the drop itself (see `BrowserHostImpl`).
   */
  async onDragDropEvent(_handler: (event: DragDropEvent) => void): Promise<UnlistenFn> {
    return () => {}
  }
}

const single = new BrowserWindow()

export type Window = BrowserWindow
export const getCurrentWindow = () => single
export const getCurrentWebviewWindow = () => single
export const getCurrentWebview = () => single
export class WebviewWindow extends BrowserWindow {}
export class LogicalSize {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
}
