// SOURCING: acorn (the declaration list is parsed as JavaScript call
// expressions, so it reads like the calls the block makes). Which calls exist
// is this app's own capability model (plan D9), hand-rolled.
import { parseExpressionAt } from 'acorn'
import type { Expression, SpreadElement } from 'acorn'

/**
 * What a block declared it may reach. A block gets exactly these and nothing
 * else: no declaration, no capability.
 */
export interface Capabilities {
  /** Workspace paths or globs it may read, `files.read("Data/*.csv")`. */
  read: Array<string>
  /** Workspace paths or globs it may write, `files.write("Data/log.csv")`. */
  write: Array<string>
  /** Shared state collections, `state("habits")`. */
  state: Array<string>
  /** Hosts it may fetch from over HTTPS, `net("api.example.com")`. */
  net: Array<string>
  /** Agent blocks it may start, `run("agent:#nightly")`. */
  run: Array<string>
}

export const noCapabilities = (): Capabilities => ({
  read: [],
  write: [],
  state: [],
  net: [],
  run: [],
})

/**
 * A block with effects runs only when someone presses Run: writing files,
 * reaching the network and starting agents are never part of recomputing.
 */
export const isEffectful = (capabilities: Capabilities): boolean =>
  capabilities.write.length > 0 ||
  capabilities.net.length > 0 ||
  capabilities.run.length > 0

export interface Declarations {
  capabilities: Capabilities
  errors: Array<string>
}

const CALLS: Record<string, keyof Capabilities> = {
  'files.read': 'read',
  'files.write': 'write',
  state: 'state',
  net: 'net',
  run: 'run',
}

const HOST = /^[a-z0-9.-]+(:\d+)?$/i
const RUN_TARGET = /^agent:#[\w:.-]+$/

function calleeName(node: Expression): string | null {
  if (node.type === 'Identifier') return node.name
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.property.type === 'Identifier'
  )
    return `${node.object.name}.${node.property.name}`
  return null
}

function stringArgument(
  node: Expression | SpreadElement | undefined,
): string | null {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? null
  return null
}

function validate(kind: keyof Capabilities, value: string): string | null {
  if (kind === 'net' && !HOST.test(value))
    return `net("${value}") needs a host name such as api.example.com`
  if (kind === 'run' && !RUN_TARGET.test(value))
    return `run("${value}") needs an agent block such as agent:#nightly`
  if (
    (kind === 'read' || kind === 'write') &&
    /^\/|(^|\/)\.\.(\/|$)/.test(value)
  )
    return `files.${kind}("${value}") must stay inside the folder`
  return null
}

/** Parses one list of declarations, `files.read("a.csv"), state("x")`. */
export function parseDeclarationList(
  text: string,
  into: Declarations = { capabilities: noCapabilities(), errors: [] },
): Declarations {
  if (!text.trim()) return into
  let expression: Expression
  try {
    expression = parseExpressionAt(text, 0, { ecmaVersion: 'latest' })
  } catch (error) {
    into.errors.push(
      `Cannot read "${text.trim()}": ${(error as Error).message}`,
    )
    return into
  }
  const calls =
    expression.type === 'SequenceExpression'
      ? expression.expressions
      : [expression]
  for (const call of calls) {
    const source = text.slice(call.start, call.end)
    const kind =
      call.type === 'CallExpression' && call.callee.type !== 'Super'
        ? CALLS[calleeName(call.callee) ?? '']
        : undefined
    const value =
      call.type === 'CallExpression' && call.arguments.length === 1
        ? stringArgument(call.arguments[0])
        : null
    if (!kind || value === null) {
      into.errors.push(
        `"${source}" is not a declaration; use files.read("…"), files.write("…"), state("…"), net("…") or run("agent:#…")`,
      )
      continue
    }
    const problem = validate(kind, value)
    if (problem) into.errors.push(problem)
    else if (!into.capabilities[kind].includes(value))
      into.capabilities[kind].push(value)
  }
  return into
}

const USES_LINE = /^\s*\/\/\s*uses:(.*)$/

/**
 * The declarations in a code block's leading comments:
 *
 *     // uses: files.read("Data/habits.csv"), state("habits")
 *     // uses: net("api.example.com")
 *
 * Only the comment lines before the first line of code count.
 */
export function parseCodeDeclarations(source: string): Declarations {
  const declarations: Declarations = {
    capabilities: noCapabilities(),
    errors: [],
  }
  for (const line of source.split('\n')) {
    const uses = USES_LINE.exec(line)
    if (uses) parseDeclarationList(uses[1] ?? '', declarations)
    else if (line.trim() !== '' && !/^\s*(\/\/|\/\*|\*)/.test(line)) break
  }
  return declarations
}

/** The declarations of an HTML app, from `<meta name="theorem:uses" content="…">`. */
export function parseHtmlDeclarations(contents: Array<string>): Declarations {
  const declarations: Declarations = {
    capabilities: noCapabilities(),
    errors: [],
  }
  for (const content of contents) parseDeclarationList(content, declarations)
  return declarations
}
