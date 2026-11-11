// SOURCING: coss ui Sidebar groups, Collapsible, Field, Select and Alert, the project's vendored Base UI
// kit, and CodeMirror (already the code surface in blocks, in lib/codemirror-theme's theme)
// for values. The rail's panels are built from these and the coss controls they wrap, so
// none of them styles a raw one.
import { json } from '@codemirror/lang-json'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/coss/alert'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/coss/collapsible'
import { Field, FieldDescription, FieldLabel } from '@/components/coss/field'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from '@/components/coss/sidebar'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Icon } from '@/components/icons'
import type { IconName } from '@/components/icons'
import { describeError } from '@/lib/theorem/client'
import { useCodeMirrorTheme } from '@/lib/codemirror-theme'

/** One titled part of a panel. It folds, so a long panel stays navigable. */
export function Section({
  title,
  Mark,
  action,
  defaultOpen = true,
  children,
}: {
  title: string
  Mark?: (typeof Icon)[IconName]
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      render={<SidebarGroup className="border-b border-separator" />}
    >
      <header className="flex items-center gap-2 pe-1">
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="group min-w-0 flex-1 gap-1.5 text-left hover:bg-sidebar-accent"
        >
          <Icon.ChevronRight className="size-3 shrink-0 text-ink-muted transition-transform group-data-[panel-open]:rotate-90" />
          {Mark && <Mark className="size-3.5 shrink-0 text-ink-muted" />}
          <h3 className="min-w-0 truncate font-medium">{title}</h3>
        </SidebarGroupLabel>
        {action}
      </header>
      <CollapsiblePanel>
        <SidebarGroupContent className="flex flex-col gap-2 px-2 pt-1 pb-1 text-xs text-ink-muted">
          {children}
        </SidebarGroupContent>
      </CollapsiblePanel>
    </Collapsible>
  )
}

/** A labeled control. The label names it for assistive technology too. */
export function Labeled({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs font-normal text-ink-muted sm:text-xs">
        {label}
      </FieldLabel>
      {children}
      {hint && (
        <FieldDescription className="text-xs text-ink-faint">
          {hint}
        </FieldDescription>
      )}
    </Field>
  )
}

/** One of a known list of values. `T` keeps a caller's union type through onChange. */
export function Choice<T extends string>({
  label,
  value,
  options,
  placeholder = 'Choose',
  disabled,
  onChange,
}: {
  label: string
  value: T | undefined
  options: ReadonlyArray<T | { value: T; label: string }>
  placeholder?: string
  disabled?: boolean
  onChange: (next: T) => void
}) {
  const items = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  )
  return (
    <Select
      value={value ?? null}
      items={items}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectPopup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  )
}

export function ToolError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <Alert variant="error" className="px-2.5 py-2">
      <AlertDescription className="text-xs break-words">
        {describeError(error)}
      </AlertDescription>
    </Alert>
  )
}

const VALUE_THEME = EditorView.theme({
  '&': { fontSize: '11px', maxHeight: '16rem' },
  '.cm-scroller': { overflow: 'auto' },
})
const VALUE_EXTENSIONS = [json(), EditorView.lineWrapping, VALUE_THEME]

/** A value Theorem returned: folds, scrolls, and selects like code. */
export function Json({ value }: { value: unknown }) {
  const codeMirrorTheme = useCodeMirrorTheme()
  return (
    <CodeMirror
      className="overflow-hidden rounded-md border border-separator"
      value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      extensions={VALUE_EXTENSIONS}
      theme={codeMirrorTheme}
      editable={false}
      basicSetup={{
        lineNumbers: false,
        foldGutter: true,
        highlightActiveLine: false,
      }}
    />
  )
}
