// What an App shows, as assistive technology would read it: each thing with a
// role, the name it goes by, and the state it is in. This is how an agent sees
// what it built without pixels, and addresses a part of it by what it is.

/** The longest name or value written for one thing. */
const MAX_TEXT = 120
/** The most lines an outline holds; the rest are counted. */
export const MAX_OUTLINE_LINES = 400

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'head'])

/** Roles a tag has with nothing said. `null` is a tag that is never a thing. */
const IMPLICIT: Record<string, string> = {
  article: 'article',
  aside: 'complementary',
  button: 'button',
  canvas: 'canvas',
  dialog: 'dialog',
  figure: 'figure',
  footer: 'contentinfo',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  hr: 'separator',
  img: 'img',
  li: 'listitem',
  main: 'main',
  meter: 'meter',
  nav: 'navigation',
  ol: 'list',
  optgroup: 'group',
  option: 'option',
  p: 'paragraph',
  progress: 'progressbar',
  summary: 'button',
  svg: 'img',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
}

const INPUT: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  search: 'searchbox',
  submit: 'button',
}

/** Roles named by what is inside them, which is then not listed again. */
const NAMED_BY_CONTENT = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'heading',
  'link',
  'menuitem',
  'option',
  'radio',
  'rowheader',
  'switch',
  'tab',
])

/** Roles whose contents are a picture, not things to read one by one. */
const OPAQUE = new Set(['img', 'canvas'])

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat
}

function hidden(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true
  if (element.getAttribute('aria-hidden') === 'true') return true
  const style = getComputedStyle(element)
  return style.display === 'none' || style.visibility === 'hidden'
}

/** The words under `node` that are shown: what `textContent` gives, less what is hidden. */
function shownText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  if (SKIPPED.has(node.localName) || hidden(node)) return ''
  let text = ''
  for (const child of node.childNodes) text += shownText(child)
  return text
}

function roleOf(element: Element): string | undefined {
  const explicit = element.getAttribute('role')?.trim().split(/\s+/)[0]
  if (explicit) return explicit === 'presentation' ? 'none' : explicit
  const tag = element.localName
  if (tag === 'a') return element.hasAttribute('href') ? 'link' : undefined
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase()
    return type === 'hidden' ? 'none' : (INPUT[type] ?? 'textbox')
  }
  if (tag === 'select')
    return element.hasAttribute('multiple') ? 'listbox' : 'combobox'
  if (tag === 'img' && element.getAttribute('alt') === '') return 'none'
  if (tag === 'section' || tag === 'form')
    return element.hasAttribute('aria-label') ||
      element.hasAttribute('aria-labelledby')
      ? tag === 'form'
        ? 'form'
        : 'region'
      : undefined
  return IMPLICIT[tag]
}

function nameOf(element: Element, role: string): string {
  const label = element.getAttribute('aria-label')
  if (label?.trim()) return clip(label)
  const labelled = element.getAttribute('aria-labelledby')
  if (labelled) {
    const text = labelled
      .split(/\s+/)
      // A label may be hidden and still name the thing, so all of it is read.
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
    if (text.trim()) return clip(text)
  }
  const labels = (element as HTMLInputElement).labels
  if (labels && labels.length > 0)
    return clip([...labels].map((each) => shownText(each)).join(' '))
  if (role === 'img') {
    const alt =
      element.getAttribute('alt') ??
      element.querySelector(':scope > title')?.textContent
    if (alt?.trim()) return clip(alt)
  }
  if (NAMED_BY_CONTENT.has(role)) {
    const text = clip(shownText(element))
    if (text) return text
    const value = (element as HTMLInputElement).value
    if (role === 'button' && typeof value === 'string' && value)
      return clip(value)
  }
  const fallback =
    element.getAttribute('placeholder') ?? element.getAttribute('title')
  return fallback ? clip(fallback) : ''
}

function truthy(element: Element, attribute: string): boolean {
  return element.getAttribute(attribute) === 'true'
}

function statesOf(element: Element, role: string): Array<string> {
  const states: Array<string> = []
  const control = element as HTMLInputElement
  if (role === 'heading') {
    const level =
      element.getAttribute('aria-level') ??
      /^h([1-6])$/.exec(element.localName)?.[1]
    if (level) states.push(`level=${level}`)
  }
  if (role === 'checkbox' || role === 'radio' || role === 'switch') {
    const mixed =
      element.getAttribute('aria-checked') === 'mixed' || control.indeterminate
    if (mixed) states.push('checked=mixed')
    else if (control.checked === true || truthy(element, 'aria-checked'))
      states.push('checked')
  }
  if (control.disabled === true || truthy(element, 'aria-disabled'))
    states.push('disabled')
  const expanded = element.getAttribute('aria-expanded')
  if (expanded === 'true') states.push('expanded')
  if (expanded === 'false') states.push('collapsed')
  if (
    truthy(element, 'aria-selected') ||
    (element as HTMLOptionElement).selected === true
  )
    states.push('selected')
  if (truthy(element, 'aria-pressed')) states.push('pressed')
  if (control.required === true || truthy(element, 'aria-required'))
    states.push('required')
  if (truthy(element, 'aria-invalid')) states.push('invalid')
  if (control.readOnly === true && role === 'textbox') states.push('readonly')
  if (element.ownerDocument.activeElement === element) states.push('focused')
  const source = element.getAttribute('data-theorem-source')
  if (source) states.push(`source=${source}`)
  return states
}

/** What a field holds, for the roles that hold something. */
function valueOf(element: Element, role: string): string | undefined {
  const holds =
    role === 'textbox' ||
    role === 'searchbox' ||
    role === 'spinbutton' ||
    role === 'slider' ||
    role === 'combobox'
  if (!holds) {
    if (role === 'progressbar' || role === 'meter')
      return (
        element.getAttribute('aria-valuenow') ??
        element.getAttribute('value') ??
        undefined
      )
    return undefined
  }
  if (element instanceof HTMLSelectElement)
    return clip(element.selectedOptions[0]?.textContent ?? '')
  const value = (element as HTMLInputElement).value
  if (typeof value === 'string') return clip(value)
  return element.getAttribute('aria-valuenow') ?? undefined
}

function quote(text: string): string {
  return JSON.stringify(text)
}

/** Whether anything inside can be acted on by itself, so it must be listed. */
function holdsControls(element: Element): boolean {
  return (
    element.querySelector(
      'a[href], button, input, select, textarea, [role], [tabindex]',
    ) !== null
  )
}

function walk(node: Node, depth: number, lines: Array<string>): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = clip(node.textContent ?? '')
    if (text) lines.push(`${'  '.repeat(depth)}- text: ${quote(text)}`)
    return
  }
  if (!(node instanceof Element)) return
  if (SKIPPED.has(node.localName) || hidden(node)) return
  const role = roleOf(node)
  if (role === undefined || role === 'none') {
    for (const child of node.childNodes) walk(child, depth, lines)
    return
  }
  const name = nameOf(node, role)
  const states = statesOf(node, role)
  const value = valueOf(node, role)
  let line = `${'  '.repeat(depth)}- ${role}`
  if (name) line += ` ${quote(name)}`
  for (const state of states) line += ` [${state}]`
  if (value !== undefined) line += `: ${quote(value)}`
  const inside: Array<string> = []
  // A thing named by what is inside it has said it, unless a part can be used
  // alone. A picture has no parts to read.
  const closed =
    OPAQUE.has(role) || (NAMED_BY_CONTENT.has(role) && !holdsControls(node))
  if (!closed)
    for (const child of node.childNodes) walk(child, depth + 1, inside)
  const prefix = `${'  '.repeat(depth + 1)}- text: `
  if (
    value === undefined &&
    inside.length > 0 &&
    inside.every((each) => each.startsWith(prefix))
  ) {
    // Only words inside: they go on the thing's own line.
    const words = inside
      .map((each) => JSON.parse(each.slice(prefix.length)) as string)
      .join(' ')
    lines.push(words === name ? line : `${line}: ${quote(clip(words))}`)
    return
  }
  lines.push(line, ...inside)
}

/**
 * The page under `root` as a list of what is on it, one thing a line, indented
 * under what holds it:
 *
 *     - heading "Shopping list" [level=1]
 *     - textbox "New item": ""
 *     - button "Add" [disabled] [source=main.tsx:12:7]
 *
 * A `canvas` is listed and not read: what is drawn on one has no parts.
 */
export function outlineOf(root: Element): string {
  const lines: Array<string> = []
  for (const child of root.childNodes) walk(child, 0, lines)
  if (lines.length <= MAX_OUTLINE_LINES) return lines.join('\n')
  const more = lines.length - MAX_OUTLINE_LINES
  return [...lines.slice(0, MAX_OUTLINE_LINES), `… ${more} more`].join('\n')
}
