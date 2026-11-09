// SOURCING: @openuidev/react-lang Renderer (Root and Content slots, onParseResult
// and onError) running an artifact's program locally, with no model in the loop;
// @openuidev/lang-core isElementNode to read subjects off the parsed tree;
// ui/button; askAbout puts selection and repair references in the composer.
//
// The renderer for form "openui". It draws no outer title: the artifact card
// above it shows one. Interaction is local and needs no activation step.
import { isElementNode } from '@openuidev/lang-core'
import type { ElementNode } from '@openuidev/lang-core'
import { Renderer } from '@openuidev/react-lang'
import type { OpenUIError, ParseResult } from '@openuidev/react-lang'
import { useMemo, useState } from 'react'
import { askAbout } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'
import { cn } from '@/lib/utils'
import type { RendererProps } from '../artifact-registry'
import { SelectionContext, SubjectsContext } from './context'
import { LIBRARY_ID, LIBRARY_VERSION, artifactLibrary } from './library'
import { repairReference, selectionReference } from './selection'
import type { RepairHint, RepairProblem } from './selection'

/**
 * The one hook for the surface an artifact's content sits on. When the paper
 * material lands, it styles this class; nothing else here names a material.
 */
export const ARTIFACT_SURFACE = 'artifact-surface'

/** Subjects in the order the program first names them, which is the order they take tones. */
export function subjectsOf(root: ElementNode | null): string[] {
  const found: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && !found.includes(value)) found.push(value)
  }
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!isElementNode(value)) return
    for (const [key, prop] of Object.entries(value.props)) {
      if (key === 'subject') add(prop)
      else if (key === 'subjects' && Array.isArray(prop)) prop.forEach(add)
      else walk(prop)
    }
  }
  walk(root)
  return found
}

/** Why this build cannot render a program written for `library`, when it cannot. */
function libraryProblem(library: TheoremArtifactLibrary): RepairProblem | undefined {
  if (!library)
    return {
      code: 'library-id',
      message: `The artifact names no component library; this build renders ${LIBRARY_ID} version ${LIBRARY_VERSION}.`,
      hint: `Publish it with library { id: "${LIBRARY_ID}", version: "${LIBRARY_VERSION}" }.`,
    }
  if (library.id !== LIBRARY_ID)
    return {
      code: 'library-id',
      message: `The program was written for ${library.id}, which this build doesn't have; it renders ${LIBRARY_ID} version ${LIBRARY_VERSION}.`,
      hint: `Rewrite the program with the ${LIBRARY_ID} components.`,
    }
  if (library.version !== LIBRARY_VERSION)
    return {
      code: 'library-version',
      message: `The program was written for ${LIBRARY_ID} ${library.version}; this build renders version ${LIBRARY_VERSION}.`,
      hint: `Rewrite the program against ${LIBRARY_ID} version ${LIBRARY_VERSION}.`,
    }
  return undefined
}

type TheoremArtifactLibrary = RendererProps['artifact']['library']

const repairProblem = (error: OpenUIError): RepairProblem => ({
  code: error.code,
  message: error.message,
  ...(error.statementId && { statementId: error.statementId }),
  ...(error.hint && { hint: error.hint }),
})

/**
 * What OpenUI tolerates while a program streams but a stored one should not
 * have: a statement cut off partway, and names used but never defined.
 */
function storedProblems(parsed: ParseResult | null): RepairProblem[] {
  if (!parsed) return []
  const cut: RepairProblem[] = parsed.meta.incomplete
    ? [
        {
          code: 'incomplete',
          message: 'The program ends partway through a statement.',
          hint: 'Finish every statement; the program looks cut off.',
        },
      ]
    : []
  return [
    ...cut,
    ...[...new Set(parsed.meta.unresolved)].map(
      (name): RepairProblem => ({
        code: 'unresolved',
        statementId: name,
        message: `${name} is used but never defined.`,
        hint: `Define ${name} = ... or remove the reference to it.`,
      }),
    ),
  ]
}

export function OpenUIArtifact({ artifact }: RendererProps) {
  const ref = {
    artifactId: artifact.artifactId,
    revision: artifact.revision,
    title: artifact.title,
  }
  const library = { id: LIBRARY_ID, version: LIBRARY_VERSION }
  const refused = libraryProblem(artifact.library)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [errors, setErrors] = useState<OpenUIError[]>([])
  const [selected, setSelected] = useState<AppSelection>()
  const subjects = useMemo(() => subjectsOf(parsed?.root ?? null), [parsed])
  const selection = useMemo(
    () => ({ selected, select: setSelected }),
    [selected],
  )

  if (refused)
    return (
      <ProgramProblem
        title="This artifact can't be shown here."
        hint={{ library, problems: [refused] }}
        onFix={(hint) => askAbout(repairReference(ref, hint))}
      />
    )

  const problems = [
    ...errors
      .filter((error) => error.severity !== 'warning')
      .map(repairProblem),
    ...storedProblems(parsed),
  ]
  const unreadable =
    !artifact.content.trim() ||
    (parsed !== null && (!parsed.root || parsed.meta.incomplete))
  const hint: RepairHint = {
    library,
    problems: problems.length
      ? problems
      : [
          {
            code: 'parse-failed',
            message: 'The program produced nothing to render.',
            hint: `Start with \`root = Stack([...])\` and use ${LIBRARY_ID} components.`,
          },
        ],
  }

  return (
    <div
      data-library={`${LIBRARY_ID}@${LIBRARY_VERSION}`}
      className={cn(ARTIFACT_SURFACE, 'flex flex-col gap-4 p-4 text-ink')}
    >
      <SubjectsContext value={subjects}>
        <SelectionContext value={selection}>
          <Renderer.Root
            response={artifact.content}
            library={artifactLibrary}
            onParseResult={setParsed}
            onError={setErrors}
          >
            <Renderer.Content hidden={unreadable} />
          </Renderer.Root>
        </SelectionContext>
      </SubjectsContext>
      {unreadable ? (
        <ProgramProblem
          title="This artifact's program couldn't be read."
          hint={hint}
          onFix={(h) => askAbout(repairReference(ref, h))}
        />
      ) : (
        problems.length > 0 && (
          <ProblemsNote
            problems={problems}
            onFix={() => askAbout(repairReference(ref, hint))}
          />
        )
      )}
      {selected && (
        <div
          data-slot="openui-selection"
          className="flex items-center gap-2 border-t border-separator pt-3 text-xs"
        >
          <span className="min-w-0 flex-1 truncate text-ink-muted">
            Selected:{' '}
            <span className="text-ink">
              {selected.entityLabel || selected.text}
            </span>
          </span>
          <Button size="xs" variant="ghost" onClick={() => setSelected(undefined)}>
            Clear
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => askAbout(selectionReference(ref, selected))}
          >
            Ask about selection
          </Button>
        </div>
      )}
    </div>
  )
}

function ProgramProblem({
  title,
  hint,
  onFix,
}: {
  title: string
  hint: RepairHint
  onFix: (hint: RepairHint) => void
}) {
  return (
    <div
      role="alert"
      data-slot="openui-problem"
      data-repair-hint={JSON.stringify(hint)}
      className="flex flex-col gap-3 p-4 text-sm"
    >
      <p className="font-medium text-ink">{title}</p>
      <ul className="flex flex-col gap-1 text-xs text-ink-muted">
        {hint.problems.map((problem, i) => (
          <li key={i}>
            {problem.statementId && (
              <code className="mr-1.5 text-ink">{problem.statementId}</code>
            )}
            {problem.message}
          </li>
        ))}
      </ul>
      <div>
        <Button size="xs" variant="secondary" onClick={() => onFix(hint)}>
          Ask to fix
        </Button>
      </div>
    </div>
  )
}

/** Parts of the program that didn't render, under what did. */
function ProblemsNote({
  problems,
  onFix,
}: {
  problems: RepairProblem[]
  onFix: () => void
}) {
  return (
    <div
      data-slot="openui-problems"
      className="flex items-start gap-2 border-t border-separator pt-3 text-xs text-ink-muted"
    >
      <p className="min-w-0 flex-1">
        {problems.length === 1
          ? 'One part of this artifact didn’t render: '
          : `${problems.length} parts of this artifact didn’t render: `}
        {problems.map((problem, i) => (
          <span key={i}>
            {i > 0 && '; '}
            {problem.statementId && (
              <code className="text-ink">{problem.statementId}</code>
            )}{' '}
            {problem.message}
          </span>
        ))}
      </p>
      <Button size="xs" variant="ghost" onClick={onFix}>
        Ask to fix
      </Button>
    </div>
  )
}
