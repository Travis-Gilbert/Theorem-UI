// SOURCING: react-json-view-lite (a collapsible tree with keyboard and ARIA
// support) over jsonc-parser, which also reads the comments and trailing
// commas of config files such as tsconfig.json.
import { parse, printParseErrorCode } from 'jsonc-parser'
import type { ParseError } from 'jsonc-parser'
import { useTheme } from 'next-themes'
import { useMemo } from 'react'
import {
  JsonView,
  collapseAllNested,
  darkStyles,
  defaultStyles,
} from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'
import { useTextFile } from '@/lib/handlers/file-sync'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage, textFileMessage } from '../file-status'

type Parsed = { value: unknown } | { error: string }

export function parseJson(text: string): Parsed {
  const errors: Array<ParseError> = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  const [first] = errors
  if (first) {
    const line = text.slice(0, first.offset).split('\n').length
    return { error: `${printParseErrorCode(first.error)} on line ${line}` }
  }
  return { value }
}

function Tree({
  value,
  expand,
}: {
  value: unknown
  expand: (level: number) => boolean
}) {
  const { resolvedTheme } = useTheme()
  if (value === null || typeof value !== 'object')
    return <pre className="p-3 font-mono text-sm">{JSON.stringify(value)}</pre>
  const colours = resolvedTheme === 'dark' ? darkStyles : defaultStyles
  return (
    <JsonView
      data={value}
      shouldExpandNode={expand}
      // The panel's surface, not the library's grey or solarized box.
      style={{ ...colours, container: 'leading-relaxed' }}
    />
  )
}

function useJson(file: { client: FileViewProps['client']; path: string }) {
  const text = useTextFile(file)
  const parsed = useMemo(
    () => (text.text === undefined ? undefined : parseJson(text.text)),
    [text.text],
  )
  return { message: textFileMessage(text), parsed }
}

/** Opens the top two levels. */
const expandTop = (level: number) => level < 2

export function JsonPanel(file: FileViewProps) {
  const { message, parsed } = useJson(file)
  if (message !== null || !parsed) return <FileMessage>{message}</FileMessage>
  if ('error' in parsed)
    return (
      <FileMessage>This file is not valid JSON: {parsed.error}.</FileMessage>
    )
  return (
    <div className="h-full overflow-auto p-2 font-mono text-[13px]">
      <Tree value={parsed.value} expand={expandTop} />
    </div>
  )
}

/** The top level, its children folded. */
export function JsonCard({ client, path }: FileCardProps) {
  const { message, parsed } = useJson({ client, path })
  if (message !== null || !parsed)
    return <FileMessage className="text-xs">{message}</FileMessage>
  if ('error' in parsed)
    return <FileMessage className="text-xs">Not valid JSON.</FileMessage>
  return (
    <div className="pointer-events-none h-full overflow-hidden bg-raised p-1 font-mono text-[11px]">
      <Tree value={parsed.value} expand={collapseAllNested} />
    </div>
  )
}
