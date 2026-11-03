// SOURCING: none — replaces OpenIDEA's `workbench/WindowControls` (the minimise / maximise / close
// buttons of a frameless native window). A browser tab has its own window chrome; the page draws
// none. `TitleBar` still imports the module by its original name, so the build maps it here.

export function WindowControls(_props: { dialog?: boolean }) {
  return null
}
