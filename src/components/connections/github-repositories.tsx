// SOURCING: coss ui Checkbox, Input, Badge over the settings frame, fuzzysort (via ./search) for many repositories; lib/theorem/connections' saveRepositories (PUT /github/repositories)
import { useState } from 'react'
import { Badge } from '@/components/coss/badge'
import { Checkbox } from '@/components/coss/checkbox'
import { Input } from '@/components/coss/input'
import { SettingsBox } from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useGithubMutations } from '@/lib/theorem/connections'
import type {
  GithubConnection,
  GithubRepository,
} from '@/lib/theorem/connections'
import { matching } from './search'

/** Past this many repositories the list gets a search box. */
const SEARCHABLE = 8
/** Rows drawn per installation before the search narrows them. */
const SHOWN = 50

const trackedOf = (github: GithubConnection) =>
  github.installations
    .flatMap((installation) => installation.repos)
    .filter((repo) => repo.tracked)
    .map((repo) => repo.fullName)

/** Which repositories Theorem follows. Nothing is saved until Save. */
export function GithubRepositories({ github }: { github: GithubConnection }) {
  const { saveRepositories } = useGithubMutations()
  const saved = trackedOf(github).toSorted()
  const signature = saved.join('\n')
  const total = github.installations.reduce(
    (count, installation) => count + installation.repos.length,
    0,
  )
  const [draft, setDraft] = useState(() => new Set(saved))
  // When the server's answer changes (after a save, or another tab's), the checkboxes follow it.
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) {
    setSeen(signature)
    setDraft(new Set(saved))
  }
  const [query, setQuery] = useState('')

  const changed =
    draft.size !== saved.length || saved.some((name) => !draft.has(name))
  const toggle = (name: string, on: boolean) => {
    const next = new Set(draft)
    if (on) next.add(name)
    else next.delete(name)
    setDraft(next)
  }

  if (github.installations.length === 0)
    return (
      <p className="text-sm text-ink-muted">
        GitHub shows Theorem no repositories yet. Install the Theorem app on an
        account or organization in GitHub, then come back.
      </p>
    )

  return (
    <div className="flex flex-col gap-3">
      {total > SEARCHABLE && (
        <Input
          type="search"
          aria-label="Search repositories"
          placeholder="Search repositories"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {github.installations.map((installation) => {
        const repos = matching(
          installation.repos,
          query,
          (repo: GithubRepository) => repo.fullName,
        )
        const tracked = installation.repos.filter((repo) =>
          draft.has(repo.fullName),
        ).length
        return (
          <div key={installation.id} className="flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-2 text-xs text-ink-muted">
              <span>
                {installation.account}
                {installation.repositorySelection === 'all'
                  ? ', every repository'
                  : ', selected repositories'}
              </span>
              <span>
                {tracked} of {installation.repos.length} followed
              </span>
            </p>
            <SettingsBox>
              {repos.slice(0, SHOWN).map((repo) => (
                <label
                  key={repo.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={draft.has(repo.fullName)}
                    onCheckedChange={(on) => toggle(repo.fullName, on)}
                  />
                  <span className="min-w-0 flex-1 truncate">{repo.fullName}</span>
                  {repo.private && <Badge variant="outline">Private</Badge>}
                </label>
              ))}
              {repos.length === 0 && (
                <p className="px-3 py-2 text-sm text-ink-muted">
                  {query.trim()
                    ? 'No repository matches that.'
                    : 'This installation has no repositories.'}
                </p>
              )}
              {repos.length > SHOWN && (
                <p className="px-3 py-2 text-xs text-ink-faint">
                  Showing {SHOWN} of {repos.length}. Search to narrow the list.
                </p>
              )}
            </SettingsBox>
          </div>
        )
      })}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={!changed || saveRepositories.isPending}
          onClick={() => saveRepositories.mutate([...draft].toSorted())}
        >
          {saveRepositories.isPending ? 'Saving...' : 'Save repositories'}
        </Button>
        {changed && !saveRepositories.isPending && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(new Set(saved))}>
            Discard changes
          </Button>
        )}
        {saveRepositories.error && (
          <p role="alert" className="text-sm text-error-ink">
            {describeError(saveRepositories.error)}
          </p>
        )}
      </div>
    </div>
  )
}
