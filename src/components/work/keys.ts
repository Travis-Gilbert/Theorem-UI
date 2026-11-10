// SOURCING: none — a one-line guard over @tanstack/react-hotkeys events: whether a key press came from a control inside a list, which keeps that key for itself
/** Whether a key press came from a control inside `list` (a button, field or menu item), which keeps it for itself. */
export const fromControl = (event: KeyboardEvent, list: HTMLElement | null) =>
  event.target !== list &&
  event.target instanceof Element &&
  !!event.target.closest('button, a, input, textarea, select, [role=menuitem]')
