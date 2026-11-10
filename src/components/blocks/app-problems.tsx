// SOURCING: the app's Tailwind tokens and Button. What is wrong with an App
// (it did not build, it does not type-check, it threw while running), listed
// where a person and the agent can act on it.
import { Button } from '@/components/ui/button'
import type { AppProblem, AppProblemKind } from '@/lib/blocks/app-source'

const KIND: Record<AppProblemKind, string> = {
  build: 'Build',
  type: 'Types',
  runtime: 'Running',
}

const where = (problem: AppProblem) =>
  problem.file
    ? `${problem.file}${problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : ''}`
    : undefined

/**
 * An App's problems, and the way to hand them to the agent. `kept` says the
 * frame below still shows the last revision that built. `checking` is a type
 * check still running.
 */
export function AppProblems({
  problems,
  kept = false,
  checking = false,
  checkError,
  onFix,
}: {
  problems: ReadonlyArray<AppProblem>
  kept?: boolean
  checking?: boolean
  checkError?: string
  onFix?: () => void
}) {
  if (!problems.length && !checking && !checkError) return null
  return (
    <section
      aria-label="Problems"
      data-slot="app-problems"
      className="flex flex-col gap-1 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          role={problems.length ? 'alert' : 'status'}
          className={problems.length ? 'text-error-ink' : 'text-ink-muted'}
        >
          {problems.length
            ? `${problems.length === 1 ? '1 problem' : `${problems.length} problems`}${kept ? '. Showing the last revision that built.' : ''}`
            : checking
              ? 'Checking types…'
              : `Types were not checked: ${checkError}`}
        </span>
        {problems.length > 0 && checking && (
          <span role="status" className="text-ink-muted">
            Checking types…
          </span>
        )}
        {problems.length > 0 && onFix && (
          <Button size="xs" variant="outline" onClick={onFix}>
            Ask to fix
          </Button>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5 bg-error-container px-3 py-2 text-error-ink">
          {problems.map((problem, index) => (
            <li
              key={index}
              data-kind={problem.kind}
              className="flex flex-wrap gap-x-2 whitespace-pre-wrap"
            >
              <span className="font-medium">{KIND[problem.kind]}</span>
              {where(problem) && (
                <span className="font-mono">{where(problem)}</span>
              )}
              <span>
                {problem.code ? `${problem.code} ` : ''}
                {problem.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
