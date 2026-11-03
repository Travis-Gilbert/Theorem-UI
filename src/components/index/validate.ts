// SOURCING: @openuidev/react-lang createParser over the Index library's JSON schema (the real parser), plus the one check it cannot make: that every Query names a binding of the same view
import { createParser } from '@openuidev/react-lang'
import type { Binding } from './contract'
import { indexLibrary } from './library'

let parser: ReturnType<typeof createParser> | undefined

export type ProgramCheck = { ok: boolean; problems: string[] }

/**
 * Parses a view's program with the library this build renders. A program is
 * sound when it has a root, every reference resolves, every component and
 * prop is known, and every Query reads a binding the view declares.
 */
export function checkProgram(
  program: string,
  bindings: Record<string, Binding>,
): ProgramCheck {
  parser ??= createParser(indexLibrary.toJSONSchema())
  const result = parser.parse(program)
  const problems = result.meta.errors.map((error) =>
    error.statementId
      ? `${error.statementId}: ${error.message}`
      : error.message,
  )
  if (!result.root) problems.push('The program has no root statement.')
  if (result.meta.incomplete) problems.push('The program is cut off.')
  for (const name of result.meta.unresolved)
    problems.push(`${name} is used but never defined.`)
  for (const query of result.queryStatements) {
    const tool = query.toolAST
    if (tool?.k !== 'Str')
      problems.push(
        `${query.statementId}: a Query names its binding as a string.`,
      )
    else if (!(tool.v in bindings))
      problems.push(
        `${query.statementId}: Query reads "${tool.v}", which this view does not bind.`,
      )
  }
  for (const mutation of result.mutationStatements)
    problems.push(
      `${mutation.statementId}: views change material through their operations, not Mutation.`,
    )
  return { ok: problems.length === 0, problems }
}
