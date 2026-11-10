// SOURCING: src/stories/fake-theorem's route map (installFakeTheorem), yaml's stringify (the header a saved file carries) and components/handlers/markdown/frontmatter (the app's own header splitter, which reads the shipped files). The behaviours are SPEC-THEOREM-RESPONSE-STYLES-1.0 sections 2, 3, 5, 6 and 7, so the real hooks and the real SDK client run against it.
import { stringify } from 'yaml'
import {
  readProperties,
  splitFrontmatter,
} from '@/components/handlers/markdown/frontmatter'
import type {
  DecisionModel,
  FrameworkReference,
  ResponseFramework,
  ResponseFrameworkDetail,
  ResponseStyle,
  ResponseStyleCatalog,
  ResponseStyleDetail,
  RevisionCause,
  RevisionSummary,
  SelectionSource,
  StyleScope,
  StyleSelection,
  StyleSuggestions,
} from '@/lib/theorem/response-styles'
import type { FakeRoutes } from '../fake-theorem'
import { SHIPPED_FILES } from './response-styles-seed'

const ROOT = '/api/chat/v1/response-styles'

/** The decision models the fake offers, as OpenRouter lists them. */
export const FAKE_DECISION_MODELS: readonly DecisionModel[] = [
  { ref: 'openrouter/typesafe/jev-1.14', name: 'TypeSafe: Jev 1.14' },
  {
    ref: 'openrouter/openai/gpt-6-luna-decisions',
    name: 'OpenAI: GPT-6 Luna Decisions',
  },
  {
    ref: 'openrouter/microsoft/microsoft-decision-1',
    name: 'Microsoft: Decision 1',
  },
]

export type ResponseStylesFakeOptions = {
  /** The clock saves are stamped with. */
  now?: () => number
  /** The project each conversation belongs to, which scopes the selection when a request names only the thread. */
  threadProjects?: Readonly<Record<string, string>>
  /** Starts with these choices already made. Null or absent is unset. */
  selection?: {
    account?: string | null
    projects?: Readonly<Record<string, string | null>>
    conversations?: Readonly<Record<string, string | null>>
  }
  suggestions?: {
    enabled?: boolean
    /** The person's own pick: a ref, `none`, or null to inherit. */
    choice?: string | null
    /** The operator default (`THEOREM_DECISION_MODEL`): a ref or `none`. */
    operatorModel?: string
    /** False answers `credential_missing`. */
    hasKey?: boolean
    /** Empty models the person cannot pick, as when the list cannot be fetched. */
    models?: readonly DecisionModel[]
    last?: StyleSuggestions['last']
  }
  /** Shipped ids whose shipped file changed after the person's override was made from it. */
  updatesAvailable?: readonly string[]
  /** Preview answers 503 `response_preview_unavailable` and draft 503 `response_draft_unavailable`. */
  previewUnavailable?: boolean
}

type Kind = 'style' | 'framework'

/** What a revision holds; a style reads `frameworks` and a framework reads `references`. */
type Content = {
  name: string
  description: string
  body: string
  frameworks: string[]
  references: { path: string; body: string }[]
}

type Version = Content & {
  revision: number
  revisionId: string
  savedAtMs: number
  /** Null for the shipped baseline, which was never saved. */
  cause: RevisionCause | null
  source: string
}

type Stored = {
  id: string
  kind: Kind
  origin: 'shipped' | 'user'
  /** The shipped file's version; null for a resource the person made. */
  shippedVersion: string | null
  /** Ascending. A shipped resource starts with revision 0; a person's with 1. */
  versions: Version[]
  deleted: boolean
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

const problem = (
  status: number,
  code: string,
  title: string,
  detail: string,
  field?: string,
  extra: Record<string, unknown> = {},
) =>
  new Response(
    JSON.stringify({
      type: 'about:blank',
      title,
      status,
      code,
      detail,
      ...(field ? { field } : {}),
      ...extra,
      correlationId: crypto.randomUUID(),
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  )

const invalid = (field: string, detail: string) =>
  problem(422, 'response_style_invalid', 'That is not valid', detail, field)

/** A body that does not deserialize: a field of the wrong type, or the scope of a selection left out or unknown. */
const malformed = () =>
  problem(
    422,
    'invalid_chat_request',
    'Invalid message fields',
    'The request body does not have the fields this route reads.',
  )

/** What a style or framework may hold; lengths are bytes, as the server counts them. */
const LIMITS = { name: 200, description: 1000, body: 64 * 1024 } as const
const MAX_FRAMEWORKS = 32
const bytes = (value: string) => new TextEncoder().encode(value).length

/** The revision an `If-Match` names: `3`, `"3"` and `W/"3"` read alike. */
const ifMatchRevision = (header: string) => {
  const match = /^(?:W\/)?(?:"(\d+)"|(\d+))$/.exec(header.trim())
  return match ? Number(match[1] ?? match[2]) : undefined
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

const slugOf = (id: string) => id.slice(id.lastIndexOf('.') + 1)
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'
const frameworkPath = (id: string) => `../frameworks/${slugOf(id)}/FRAMEWORK.md`
const titleOf = (body: string) =>
  /^#{1,6}\s+(.+?)\s*$/m.exec(body)?.[1] ?? 'Untitled'

/** The Markdown file a revision is stored as: a header, a blank line, the body. */
function sourceOf(
  id: string,
  kind: Kind,
  shippedVersion: string | null,
  content: Content,
) {
  const header = stringify(
    {
      id,
      kind,
      ...(shippedVersion ? { version: shippedVersion } : {}),
      name: content.name,
      description: content.description,
      ...(kind === 'style'
        ? { frameworks: content.frameworks.map(frameworkPath) }
        : {
            references: content.references.map((reference) => reference.path),
          }),
    },
    { lineWidth: 0 },
  )
  return `---\n${header}---\n\n${content.body.trimEnd()}\n`
}

const identityOf = (source: string, content: Content) =>
  sha256(
    [
      source,
      ...content.references.map(
        (reference) => `${reference.path}\n${reference.body}`,
      ),
    ].join('\n\u0000\n'),
  )

/** A revision of this content, ready to append. */
async function versionOf(
  stored: Pick<Stored, 'id' | 'kind' | 'shippedVersion'>,
  content: Content,
  revision: number,
  cause: RevisionCause | null,
  savedAtMs: number,
  source = sourceOf(stored.id, stored.kind, stored.shippedVersion, content),
): Promise<Version> {
  return {
    ...content,
    revision,
    revisionId: await identityOf(source, content),
    savedAtMs,
    cause,
    source,
  }
}

const current = (stored: Stored) =>
  stored.versions[stored.versions.length - 1] as Version
const baselineOf = (stored: Stored) =>
  stored.versions.find((version) => version.revision === 0)

/** The pieces of one shipped file: its header's fields and its body. */
function readShipped(path: string) {
  const text = SHIPPED_FILES[path] ?? ''
  const { yaml, body } = splitFrontmatter(text)
  return {
    text,
    properties: readProperties(yaml) ?? {},
    body: body.replace(/^\s+/, '').trimEnd(),
  }
}

const slugFromPath = (path: string) =>
  /(?:^|\/)frameworks\/([^/]+)\//.exec(path)?.[1] ?? ''

/** What each shipped style's preview says about the sample question, so two variants read differently. */
const PREVIEWS: Readonly<Record<string, string>> = {
  'theorem.style.default':
    'Here is the answer, then why it holds. Which approach fits depends on how much data you expect: for a few thousand rows a direct query is fine, and beyond that batching pays for itself. If your volumes are uncertain, start direct and measure before you change it.',
  'theorem.style.concise':
    'Query it directly up to a few thousand rows. Batch beyond that.',
  'theorem.style.exploratory':
    'The direct answer: query it directly at small sizes and batch it at large ones. The more interesting question is what happens when the data grows past that line, because the access pattern changes with it. That opens two options worth comparing, an index that fits the new pattern or a precomputed summary, and the second is easy to overlook. I would check which one your reads actually need before choosing.',
  'theorem.style.educational':
    'Start with what the database does for each approach. A direct query reads every matching row once, so its cost grows with the rows. Batching splits that work into slices, trading one large read for several small ones. For example, 10,000 rows read in slices of 1,000 is ten reads that each finish quickly. The rule to carry to new cases is to compare cost per slice against cost per read.',
  'theorem.style.formal':
    'The appropriate approach depends on the expected volume. For inputs of up to several thousand rows, a direct query is sufficient and simpler to maintain. For larger inputs, batching is recommended, because it bounds the cost of each read and limits the effect of a failure to a single slice.',
}

const MODEL_NAME = 'Example chat model (fake)'

/** An edited or new style, previewed: its first instruction sentence, so the person's own text shows. */
const echo = (name: string, body: string) =>
  `In the manner of ${name}: ${body.replace(/^#.*\n+/, '').split(/(?<=\.)\s/)[0] ?? ''}`

export type ResponseStylesFake = { routes: FakeRoutes }

/**
 * An in-memory Theorem for response styles: the routes of spec section 7 with
 * the state they imply. Revisions count up, a stale `If-Match` is 412
 * `response_style_changed`, restore and reset write new revisions, a
 * duplicate is its own style, `usedBy` is worked out from the styles, the
 * selection resolves conversation, project, account, built-in, and preview and
 * draft answer canned text that differs per variant. Seeded with the five
 * shipped styles and two frameworks, at their real text.
 */
export function createResponseStylesFake(
  options: ResponseStylesFakeOptions = {},
): ResponseStylesFake {
  const now = options.now ?? Date.now
  const stored = new Map<string, Stored>()
  const choices = {
    account: options.selection?.account ?? null,
    projects: new Map(Object.entries(options.selection?.projects ?? {})),
    conversations: new Map(
      Object.entries(options.selection?.conversations ?? {}),
    ),
  }
  const suggest = {
    enabled: options.suggestions?.enabled ?? true,
    choice: options.suggestions?.choice ?? null,
  }
  const models = options.suggestions?.models ?? FAKE_DECISION_MODELS

  async function seed() {
    const frameworkIds = new Map<string, string>()
    for (const path of Object.keys(SHIPPED_FILES)) {
      if (!path.endsWith('FRAMEWORK.md')) continue
      frameworkIds.set(
        slugFromPath(path),
        str(readShipped(path).properties.id) ?? '',
      )
    }
    for (const path of Object.keys(SHIPPED_FILES)) {
      const isStyle = path.startsWith('styles/')
      if (!isStyle && !path.endsWith('FRAMEWORK.md')) continue
      const { text, properties, body } = readShipped(path)
      const id = str(properties.id) ?? ''
      const listed = (key: string) =>
        (Array.isArray(properties[key]) ? properties[key] : []).filter(
          (item): item is string => typeof item === 'string',
        )
      const folder = path.slice(0, path.lastIndexOf('/') + 1)
      const content: Content = {
        name: str(properties.name) ?? id,
        description: str(properties.description) ?? '',
        body,
        frameworks: listed('frameworks').map(
          (reference) =>
            frameworkIds.get(slugFromPath(reference.replace('../', ''))) ?? '',
        ),
        references: listed('references').map((reference) => ({
          path: reference,
          body: (SHIPPED_FILES[`${folder}${reference}`] ?? '').trimEnd(),
        })),
      }
      const entry = {
        id,
        kind: isStyle ? ('style' as const) : ('framework' as const),
        shippedVersion: str(properties.version) ?? null,
      }
      stored.set(id, {
        ...entry,
        origin: 'shipped',
        versions: [await versionOf(entry, content, 0, null, 0, text)],
        deleted: false,
      })
    }
  }
  const ready = seed()

  // -- views ---------------------------------------------------------------

  const live = (kind: Kind) =>
    [...stored.values()].filter((item) => item.kind === kind && !item.deleted)
  const find = (kind: Kind, id: string) => {
    const item = stored.get(decodeURIComponent(id))
    return item && item.kind === kind && !item.deleted ? item : undefined
  }
  const usedBy = (frameworkId: string) =>
    live('style')
      .filter((style) => current(style).frameworks.includes(frameworkId))
      .map((style) => ({ id: style.id, name: current(style).name }))

  const header = (item: Stored, version: Version) => ({
    id: item.id,
    name: version.name,
    description: version.description,
    origin: item.origin,
    revision: version.revision,
    revisionId: version.revisionId,
    updatedAtMs: version.savedAtMs,
    shipped:
      item.origin === 'shipped'
        ? {
            version: item.shippedVersion,
            revisionId: baselineOf(item)?.revisionId ?? '',
            updateAvailable:
              (options.updatesAvailable ?? []).includes(item.id) &&
              current(item).revision > 0,
          }
        : null,
  })
  const styleSummary = (
    item: Stored,
    version = current(item),
  ): ResponseStyle => ({
    ...header(item, version),
    kind: 'style',
    frameworks: version.frameworks,
  })
  const styleDetail = (
    item: Stored,
    version = current(item),
  ): ResponseStyleDetail => ({
    ...styleSummary(item, version),
    body: version.body,
    source: version.source,
  })
  const frameworkSummary = (
    item: Stored,
    version = current(item),
  ): ResponseFramework => ({
    ...header(item, version),
    kind: 'framework',
    references: version.references.map(({ path }) => ({
      path,
      title: titleOf(
        version.references.find((reference) => reference.path === path)?.body ??
          '',
      ),
    })),
    usedBy: usedBy(item.id),
  })
  const frameworkDetail = (
    item: Stored,
    version = current(item),
  ): ResponseFrameworkDetail => ({
    ...frameworkSummary(item, version),
    references: version.references.map((reference): FrameworkReference => ({
      ...reference,
      title: titleOf(reference.body),
    })),
    body: version.body,
    source: version.source,
  })
  const detail = (item: Stored, version = current(item)) =>
    item.kind === 'style'
      ? styleDetail(item, version)
      : frameworkDetail(item, version)

  // -- selection (spec section 3) -------------------------------------------

  const projectOf = (scope: StyleScope) =>
    scope.projectId ??
    (scope.threadId ? options.threadProjects?.[scope.threadId] : undefined)
  function selectionFor(scope: StyleScope): StyleSelection {
    const picked = {
      conversation: scope.threadId
        ? (choices.conversations.get(scope.threadId) ?? null)
        : null,
      project: projectOf(scope)
        ? (choices.projects.get(projectOf(scope) ?? '') ?? null)
        : null,
      account: choices.account,
    }
    const order: SelectionSource[] = ['conversation', 'project', 'account']
    for (const source of order) {
      const id = picked[source as 'conversation' | 'project' | 'account']
      const style = id ? find('style', id) : undefined
      if (style) {
        return {
          ...picked,
          effective: { style: style.id, name: current(style).name, source },
        }
      }
    }
    const builtin = find('style', 'theorem.style.default')
    return {
      ...picked,
      effective: {
        style: 'theorem.style.default',
        name: builtin ? current(builtin).name : 'Default',
        source: 'builtin',
      },
    }
  }

  // -- suggestions (spec section 6) -----------------------------------------

  function suggestions(): StyleSuggestions {
    const shipped = FAKE_DECISION_MODELS[0]?.ref ?? null
    const operator = options.suggestions?.operatorModel
    const source =
      suggest.choice !== null
        ? 'user'
        : operator !== undefined
          ? 'operator'
          : 'shipped'
    const picked = suggest.choice ?? operator ?? shipped
    const model = picked === 'none' ? null : picked
    return {
      enabled: suggest.enabled,
      state: !suggest.enabled
        ? 'disabled'
        : model === null
          ? 'no_model'
          : options.suggestions?.hasKey === false
            ? 'credential_missing'
            : 'ready',
      model,
      modelSource: source,
      choice: suggest.choice,
      models: [...models],
      last: options.suggestions?.last ?? null,
    }
  }

  // -- writes ----------------------------------------------------------------

  const revisionGuard = (request: Request, item: Stored) => {
    const sent = request.headers.get('If-Match')
    if (sent === null)
      return problem(
        428,
        'response_style_revision_required',
        'A revision is required',
        'Send the revision you are changing as If-Match.',
      )
    const named = ifMatchRevision(sent)
    if (named === undefined)
      return problem(
        400,
        'invalid_chat_revision',
        'Invalid revision',
        'If-Match is a revision number.',
      )
    if (named !== current(item).revision)
      return problem(
        412,
        'response_style_changed',
        'This changed after you opened it',
        `It was saved again as revision ${current(item).revision}. Read it again and merge your change.`,
        undefined,
        { currentRevision: current(item).revision },
      )
    return undefined
  }
  /** An id that names nothing: 404 in a path, 422 in a body (with the field only where the server gives one). */
  const missing = (kind: Kind, id: string, status = 404, field?: string) =>
    problem(
      status,
      `response_${kind}_unknown`,
      kind === 'style' ? 'No such style' : 'No such framework',
      `There is no ${kind} ${id}.`,
      field,
    )

  /** Content from a request body, or the problem that refuses it. */
  function contentFrom(
    kind: Kind,
    body: Record<string, unknown>,
    base?: Content,
  ): Content | Response {
    const content: Content = {
      name: str(body.name) ?? base?.name ?? '',
      description: str(body.description) ?? base?.description ?? '',
      body: str(body.body) ?? base?.body ?? '',
      frameworks: base?.frameworks ?? [],
      references: base?.references ?? [],
    }
    if (!content.name.trim()) return invalid('name', 'Give it a name.')
    const over = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).find(
      (field) => bytes(content[field]) > LIMITS[field],
    )
    if (over)
      return invalid(
        over,
        `Keep the ${over} to ${LIMITS[over]} bytes or fewer.`,
      )
    if (kind === 'style' && body.frameworks !== undefined) {
      if (
        !Array.isArray(body.frameworks) ||
        body.frameworks.some((id) => typeof id !== 'string')
      )
        return invalid('frameworks', 'Frameworks are a list of ids.')
      const ids = body.frameworks as string[]
      if (ids.length > MAX_FRAMEWORKS)
        return invalid(
          'frameworks',
          `A style lists at most ${MAX_FRAMEWORKS} frameworks.`,
        )
      const unknown = ids.find((id) => !find('framework', id))
      if (unknown) return missing('framework', unknown, 422)
      content.frameworks = ids
    }
    if (kind === 'framework' && body.references !== undefined) {
      if (!Array.isArray(body.references))
        return invalid('references', 'References are a list.')
      const references = body.references.map((item) => ({
        path: str(record(item).path) ?? '',
        body: str(record(item).body) ?? '',
      }))
      const bad = references.find(
        (reference) =>
          !/^references\/[^/]+\.md$/.test(reference.path) ||
          !reference.body.trim(),
      )
      if (bad)
        return invalid(
          'references',
          'A reference needs a path under references/ and some text.',
        )
      if (
        new Set(references.map((reference) => reference.path)).size !==
        references.length
      )
        return invalid('references', 'Two references share a path.')
      content.references = references
    }
    return content
  }

  const uniqueId = (kind: Kind, name: string) => {
    const base = `user.${kind}.${slugify(name)}`
    let id = base
    for (let n = 2; stored.has(id); n += 1) id = `${base}-${n}`
    return id
  }

  async function add(
    kind: Kind,
    content: Content,
    cause: RevisionCause,
  ): Promise<Stored> {
    const entry = {
      id: uniqueId(kind, content.name),
      kind,
      shippedVersion: null,
    }
    const item: Stored = {
      ...entry,
      origin: 'user',
      versions: [await versionOf(entry, content, 1, cause, now())],
      deleted: false,
    }
    stored.set(item.id, item)
    return item
  }
  async function append(item: Stored, content: Content, cause: RevisionCause) {
    item.versions.push(
      await versionOf(item, content, current(item).revision + 1, cause, now()),
    )
  }
  const contentOf = (version: Version): Content => ({
    name: version.name,
    description: version.description,
    body: version.body,
    frameworks: version.frameworks,
    references: version.references,
  })

  // -- routes ------------------------------------------------------------------

  type Handler = (params: Record<string, string>, request: Request) => unknown
  const once =
    (handler: Handler): Handler =>
    async (params, request) => {
      await ready
      return handler(params, request)
    }
  const bodyOf = async (request: Request) =>
    record(await request.json().catch(() => ({})))
  const created = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  const scopeOf = (request: Request): StyleScope => {
    const url = new URL(request.url)
    return {
      threadId: url.searchParams.get('threadId') ?? undefined,
      projectId: url.searchParams.get('projectId') ?? undefined,
    }
  }

  function resourceRoutes(kind: Kind): FakeRoutes {
    const base = `${ROOT}/${kind === 'style' ? 'styles' : 'frameworks'}`
    return {
      [`GET ${base}/:id`]: once(({ id = '' }) => {
        const item = find(kind, id)
        return item ? detail(item) : missing(kind, id)
      }),
      [`PUT ${base}/:id`]: once(async ({ id = '' }, request) => {
        const item = find(kind, id)
        if (!item) return missing(kind, id)
        const refused = revisionGuard(request, item)
        if (refused) return refused
        const content = contentFrom(
          kind,
          await bodyOf(request),
          contentOf(current(item)),
        )
        if (content instanceof Response) return content
        await append(item, content, 'edit')
        return detail(item)
      }),
      [`DELETE ${base}/:id`]: once(({ id = '' }, request) => {
        const item = find(kind, id)
        if (!item) return missing(kind, id)
        if (item.origin === 'shipped')
          return problem(
            409,
            'response_style_shipped',
            'Shipped styles are reset, not deleted',
            'Theorem ships this one. Reset it to the shipped text instead.',
          )
        const refused = revisionGuard(request, item)
        if (refused) return refused
        const users = kind === 'framework' ? usedBy(item.id) : []
        if (users.length)
          return problem(
            409,
            'response_framework_in_use',
            'A style still lists this framework',
            `${item.id} is still listed by ${users.map((style) => style.name).join(', ')}; take it off those styles first`,
          )
        item.deleted = true
        return new Response(null, { status: 204 })
      }),
      [`GET ${base}/:id/revisions`]: once(({ id = '' }) => {
        const item = find(kind, id)
        if (!item) return missing(kind, id)
        const revisions: RevisionSummary[] = item.versions
          .map(({ revision, revisionId, savedAtMs, cause, name }) => ({
            revision,
            revisionId,
            savedAtMs,
            cause,
            name,
          }))
          .reverse()
        return { revisions }
      }),
      [`GET ${base}/:id/revisions/:revision`]: once(
        ({ id = '', revision = '' }) => {
          const item = find(kind, id)
          if (!item) return missing(kind, id)
          const version =
            revision === 'shipped'
              ? baselineOf(item)
              : item.versions.find(
                  (candidate) => String(candidate.revision) === revision,
                )
          return version
            ? detail(item, version)
            : problem(
                404,
                'response_style_revision_unknown',
                'No such revision',
                `${item.id} has no revision ${revision}.`,
              )
        },
      ),
      [`POST ${base}/:id/restore`]: once(async ({ id = '' }, request) => {
        const item = find(kind, id)
        if (!item) return missing(kind, id)
        const refused = revisionGuard(request, item)
        if (refused) return refused
        const body = await bodyOf(request)
        const shipped = body.shipped === true
        if (shipped === (typeof body.revision === 'number'))
          return invalid(
            'revision',
            'Name a revision to restore, or ask for the shipped text, but not both.',
          )
        const version = shipped
          ? baselineOf(item)
          : item.versions.find(
              (candidate) => candidate.revision === body.revision,
            )
        if (!version)
          return problem(
            404,
            'response_style_revision_unknown',
            'No such revision',
            shipped
              ? `${item.id} was made here, so it has no shipped text to go back to.`
              : `${item.id} has no revision ${String(body.revision)}.`,
          )
        // A shipped resource the person never edited already is its baseline.
        if (shipped && current(item).revision === 0) return detail(item)
        await append(
          item,
          contentOf(version),
          version.revision === 0 ? 'reset' : 'restore',
        )
        return detail(item)
      }),
    }
  }

  return {
    routes: {
      [`GET ${ROOT}`]: once((_, request) => {
        const scope = scopeOf(request)
        const catalog: ResponseStyleCatalog = {
          styles: live('style').map((item) => styleSummary(item)),
          frameworks: live('framework').map((item) => frameworkSummary(item)),
          selection: selectionFor(scope),
          suggestions: suggestions(),
        }
        return catalog
      }),
      ...resourceRoutes('style'),
      ...resourceRoutes('framework'),
      [`POST ${ROOT}/styles`]: once(async (_, request) => {
        const body = await bodyOf(request)
        const from = str(body.from)
        const source = from ? find('style', from) : undefined
        if (from && !source) return missing('style', from, 422)
        const content = contentFrom(
          'style',
          body,
          source ? contentOf(current(source)) : undefined,
        )
        if (content instanceof Response) return content
        return created(
          styleDetail(await add('style', content, from ? 'duplicate' : 'edit')),
        )
      }),
      [`POST ${ROOT}/frameworks`]: once(async (_, request) => {
        const body = await bodyOf(request)
        const from = str(body.from)
        const forStyle = str(body.forStyle)
        const source = from ? find('framework', from) : undefined
        if (from && !source) return missing('framework', from, 422)
        const style = forStyle ? find('style', forStyle) : undefined
        if (forStyle && !style) return missing('style', forStyle, 422)
        if (style && !(from && current(style).frameworks.includes(from)))
          return invalid(
            'forStyle',
            `${current(style).name} does not list that framework.`,
          )
        const content = contentFrom(
          'framework',
          body,
          source ? contentOf(current(source)) : undefined,
        )
        if (content instanceof Response) return content
        const framework = await add(
          'framework',
          content,
          from ? 'duplicate' : 'edit',
        )
        if (style) {
          await append(
            style,
            {
              ...contentOf(current(style)),
              frameworks: current(style).frameworks.map((id) =>
                id === from ? framework.id : id,
              ),
            },
            'edit',
          )
        }
        return created({
          framework: frameworkDetail(framework),
          ...(style ? { style: styleDetail(style) } : {}),
        })
      }),
      [`GET ${ROOT}/selection`]: once((_, request) =>
        selectionFor(scopeOf(request)),
      ),
      [`PUT ${ROOT}/selection`]: once(async (_, request) => {
        const body = await bodyOf(request)
        const scope = str(body.scope)
        const threadId = str(body.threadId)
        const projectId = str(body.projectId)
        const style = body.style
        if (
          (scope !== 'conversation' &&
            scope !== 'project' &&
            scope !== 'account') ||
          (style !== undefined && style !== null && typeof style !== 'string')
        )
          return malformed()
        if (style === undefined)
          return invalid('style', 'A style id, or null to use the default.')
        if (typeof style === 'string' && !find('style', style))
          return missing('style', style, 422)
        if (scope === 'conversation' && !threadId)
          return invalid('threadId', 'A conversation choice needs a threadId.')
        if (scope === 'project' && !projectId)
          return invalid('projectId', 'A project default needs a projectId.')
        if (scope === 'account') choices.account = style
        else if (scope === 'project')
          choices.projects.set(projectId ?? '', style)
        else choices.conversations.set(threadId ?? '', style)
        return selectionFor({ threadId, projectId })
      }),
      [`PUT ${ROOT}/suggestions`]: once(async (_, request) => {
        const body = await bodyOf(request)
        if (
          (body.enabled !== undefined && typeof body.enabled !== 'boolean') ||
          ('model' in body &&
            body.model !== null &&
            typeof body.model !== 'string')
        )
          return malformed()
        if ('model' in body) {
          const pick = typeof body.model === 'string' ? body.model.trim() : null
          const ref = pick?.toLowerCase() === 'none' ? 'none' : pick
          const named = ref === null || ref === 'none'
          // Any openrouter ref passes when the list could not be fetched.
          if (
            !named &&
            (!/^openrouter\/./.test(ref) ||
              (models.length > 0 && !models.some((entry) => entry.ref === ref)))
          )
            return invalid(
              'model',
              'That is not a decision model you can pick.',
            )
          suggest.choice = ref
        }
        if (typeof body.enabled === 'boolean') suggest.enabled = body.enabled
        return suggestions()
      }),
      [`POST ${ROOT}/preview`]: once(async (_, request) => {
        if (options.previewUnavailable)
          return problem(
            503,
            'response_preview_unavailable',
            'No chat model is available',
            'Theorem has no usable chat model to write a preview with.',
          )
        const body = await bodyOf(request)
        const variants = Array.isArray(body.variants)
          ? body.variants.map(record)
          : []
        if (!str(body.question)?.trim())
          return invalid('question', 'Ask a question to preview.')
        if (variants.length < 1 || variants.length > 2)
          return invalid('variants', 'Preview one or two variants.')
        const texts: { label: string; text: string }[] = []
        for (const [index, variant] of variants.entries()) {
          const label = str(variant.label) ?? ''
          const draft = record(variant.draft)
          if (variant.draft !== undefined) {
            texts.push({
              label,
              text: echo(
                str(draft.name) ?? 'this draft',
                str(draft.body) ?? '',
              ),
            })
            continue
          }
          const ref = record(variant.style)
          const id = str(ref.id) ?? ''
          const item = find('style', id)
          const field = `variants[${index}].style`
          if (!item) return missing('style', id, 422, field)
          const revision =
            typeof ref.revision === 'number'
              ? ref.revision
              : current(item).revision
          const version = item.versions.find(
            (candidate) => candidate.revision === revision,
          )
          if (!version)
            return problem(
              422,
              'response_style_unknown',
              'No such style',
              `${id} has no revision ${revision}.`,
              field,
            )
          // The shipped baseline has its canned answer; anything the person wrote or edited echoes their text.
          texts.push({
            label,
            text:
              version.revision === 0 && PREVIEWS[id]
                ? PREVIEWS[id]
                : echo(version.name, version.body),
          })
        }
        return { generated: true, model: MODEL_NAME, variants: texts }
      }),
      [`POST ${ROOT}/draft`]: once(async (_, request) => {
        if (options.previewUnavailable)
          return problem(
            503,
            'response_draft_unavailable',
            'No chat model is available',
            'Theorem has no usable chat model to write a draft with.',
          )
        const body = await bodyOf(request)
        const currentText = record(body.current)
        const instruction = str(body.instruction)?.trim()
        if (body.kind !== 'style' && body.kind !== 'framework')
          return invalid('kind', 'A draft is for a style or a framework.')
        if (!instruction) return invalid('instruction', 'Say what to change.')
        return {
          draft: {
            name: str(currentText.name) ?? '',
            description: str(currentText.description) ?? '',
            body: `${(str(currentText.body) ?? '').trimEnd()}\n\nAdjustment asked for: ${instruction}\n`,
          },
          model: MODEL_NAME,
        }
      }),
    },
  }
}

/** The routes alone, for `storyRoutes` to spread in. */
export const responseStylesRoutes = (
  options?: ResponseStylesFakeOptions,
): FakeRoutes => createResponseStylesFake(options).routes
