// SOURCING: zod (parses contributions off the manifest wire). The matching,
// validation and `resolve` are a projection of theorem-surface-contracts'
// artifact.rs, the canonical contribution contract; no library models it.
//
// A contribution claims artifact subjects by kind, media type or schema and
// offers presentations at representation distances. `resolve` picks the
// richest rung whose renderer is actually mounted in this build, walking the
// distance's fallbacks, and names every renderer it passed over and why. When
// nothing claims or nothing is mounted it answers the Theorem card.
import { z } from 'zod'

export const DISTANCES = [
  'landmark',
  'preview',
  'thing',
  'interactive',
] as const
export type Distance = (typeof DISTANCES)[number]

/** Richest first: the order `resolve` prefers. */
export const RUNGS = [
  'artifact_native',
  'provider_native',
  'theorem_card',
] as const
export type Rung = (typeof RUNGS)[number]

export type ArtifactCost = 'cache' | 'live_slot'
export type SessionNeed = 'none' | 'live'
export type CaptionPolicy = 'always' | 'optional' | 'never'
export type LocatorKind =
  | 'pdf'
  | 'text_range'
  | 'table_rows'
  | 'code_range'
  | 'image_region'
  | 'notebook_cell'
  | 'entity'
  | 'provider'

export type ArtifactSubject = {
  kind: string
  mediaType?: string
  schema?: string
}

export type ArtifactMatch = {
  objectKinds: Array<string>
  mediaTypes: Array<string>
  schemas: Array<string>
}

export type ArtifactPresentation = {
  distances: Array<Distance>
  rung: Rung
  renderer: string
  session: SessionNeed
  cost: ArtifactCost
}

export type ArtifactContribution = {
  id: string
  provider: string
  label: string
  matches: ArtifactMatch
  presentations: Array<ArtifactPresentation>
  locators: Array<LocatorKind>
  caption: CaptionPolicy
  followsTheme: boolean
}

export type Availability =
  { mounted: true } | { mounted: false; reason: string }

export type Passed = {
  contribution: string
  renderer: string
  rung: Rung
  reason: string
}

export type Representation = {
  rung: Rung
  distance: Distance
  contribution?: string
  renderer?: string
  session: SessionNeed
  cost: ArtifactCost
  caption: CaptionPolicy
  locators: Array<LocatorKind>
  passed: Array<Passed>
}

const FALLBACKS: Record<Distance, ReadonlyArray<Distance>> = {
  interactive: ['interactive', 'thing', 'preview'],
  thing: ['thing', 'preview'],
  preview: ['preview', 'thing'],
  landmark: ['landmark', 'preview'],
}

export function presentation(
  rung: Rung,
  renderer: string,
  distances: Array<Distance>,
): ArtifactPresentation {
  return { distances, rung, renderer, session: 'none', cost: 'cache' }
}

/** A presentation that holds a live session, and so a live slot. */
export function live(p: ArtifactPresentation): ArtifactPresentation {
  return { ...p, session: 'live', cost: 'live_slot' }
}

export function contribution(
  id: string,
  label: string,
  spec: {
    kinds?: Array<string>
    media?: Array<string>
    schemas?: Array<string>
    presentations: Array<ArtifactPresentation>
    locators?: Array<LocatorKind>
    caption?: CaptionPolicy
    followsTheme?: boolean
    provider?: string
  },
): ArtifactContribution {
  return {
    id,
    provider: spec.provider ?? '',
    label,
    matches: {
      objectKinds: spec.kinds ?? [],
      mediaTypes: spec.media ?? [],
      schemas: spec.schemas ?? [],
    },
    presentations: spec.presentations,
    locators: spec.locators ?? [],
    caption: spec.caption ?? 'never',
    followsTheme: spec.followsTheme ?? false,
  }
}

function mediaMatches(pattern: string, media: string): boolean {
  const bare = (media.split(';')[0] ?? media).trim().toLowerCase()
  const lower = pattern.toLowerCase()
  if (!lower.endsWith('/*')) return lower === bare
  const slash = bare.indexOf('/')
  return slash > 0 && bare.slice(0, slash) === lower.slice(0, -2)
}

export function claims(
  match: ArtifactMatch,
  subject: ArtifactSubject,
): boolean {
  const { mediaType, schema } = subject
  return (
    match.objectKinds.includes(subject.kind) ||
    (mediaType !== undefined &&
      match.mediaTypes.some((pattern) => mediaMatches(pattern, mediaType))) ||
    (schema !== undefined && match.schemas.includes(schema))
  )
}

export type ContributionError = {
  code:
    | 'empty_id'
    | 'no_matcher'
    | 'no_presentation'
    | 'contributed_card'
    | 'no_distance'
    | 'cost_mismatch'
    | 'duplicate_id'
  id: string
  renderer?: string
}

function validate(c: ArtifactContribution): ContributionError | undefined {
  const { id, matches } = c
  if (!id.trim()) return { code: 'empty_id', id }
  if (
    !matches.objectKinds.length &&
    !matches.mediaTypes.length &&
    !matches.schemas.length
  )
    return { code: 'no_matcher', id }
  if (!c.presentations.length) return { code: 'no_presentation', id }
  for (const { rung, distances, renderer, session, cost } of c.presentations) {
    if (rung === 'theorem_card') return { code: 'contributed_card', id }
    if (!distances.length) return { code: 'no_distance', id, renderer }
    if ((session === 'live') !== (cost === 'live_slot'))
      return { code: 'cost_mismatch', id, renderer }
  }
  return undefined
}

/** The first inconsistency in a set of contributions, or undefined. */
export function validateAll(
  contributions: ReadonlyArray<ArtifactContribution>,
): ContributionError | undefined {
  const seen = new Set<string>()
  for (const c of contributions) {
    const error = validate(c)
    if (error) return error
    if (seen.has(c.id)) return { code: 'duplicate_id', id: c.id }
    seen.add(c.id)
  }
  return undefined
}

function card(distance: Distance, passed: Array<Passed> = []): Representation {
  return {
    rung: 'theorem_card',
    distance,
    session: 'none',
    cost: 'cache',
    caption: 'never',
    locators: [],
    passed,
  }
}

export function resolve(
  subject: ArtifactSubject,
  distance: Distance,
  contributions: ReadonlyArray<ArtifactContribution>,
  available: (renderer: string) => Availability,
): Representation {
  const claiming = contributions.filter((c) => claims(c.matches, subject))
  const passed: Array<Passed> = []
  for (const at of FALLBACKS[distance]) {
    const candidates = claiming
      .flatMap((c) =>
        c.presentations
          .filter((p) => p.distances.includes(at))
          .map((p) => ({ c, p })),
      )
      .sort((a, b) => RUNGS.indexOf(a.p.rung) - RUNGS.indexOf(b.p.rung))
    for (const { c, p } of candidates) {
      const availability = available(p.renderer)
      if (availability.mounted)
        return {
          rung: p.rung,
          distance: at,
          contribution: c.id,
          renderer: p.renderer,
          session: p.session,
          cost: p.cost,
          caption: c.caption,
          locators: c.locators,
          passed,
        }
      if (!passed.some((x) => x.renderer === p.renderer))
        passed.push({
          contribution: c.id,
          renderer: p.renderer,
          rung: p.rung,
          reason: availability.reason,
        })
    }
  }
  return card(distance, passed)
}

const Wire = z.object({
  id: z.string(),
  provider: z.string().default(''),
  label: z.string(),
  matches: z.object({
    objectKinds: z.array(z.string()).default([]),
    mediaTypes: z.array(z.string()).default([]),
    schemas: z.array(z.string()).default([]),
  }),
  presentations: z.array(
    z.object({
      distances: z.array(z.enum(DISTANCES)),
      rung: z.enum(RUNGS),
      renderer: z.string(),
      session: z.enum(['none', 'live']).default('none'),
      cost: z.enum(['cache', 'live_slot']).default('cache'),
    }),
  ),
  locators: z
    .array(
      z.enum([
        'pdf',
        'text_range',
        'table_rows',
        'code_range',
        'image_region',
        'notebook_cell',
        'entity',
        'provider',
      ]),
    )
    .default([]),
  caption: z.enum(['always', 'optional', 'never']).default('never'),
  followsTheme: z.boolean().default(false),
})

/** A contribution off the manifest wire, or undefined when it does not parse. */
export function readContribution(
  value: unknown,
): ArtifactContribution | undefined {
  const parsed = Wire.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
