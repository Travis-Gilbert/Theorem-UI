// SOURCING: @tanstack/react-query over the same-origin link-metadata route
// (server/link-preview.ts). The link-preview element renders props; this is
// the fetch/cache that supplies them, keyed by URL so every citation of one
// source shares one request and one result.
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

const metadataSchema = z.object({
  href: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  siteName: z.string().optional(),
  favicon: z.string().optional(),
})

export type LinkMetadata = z.infer<typeof metadataSchema>

export const linkMetadataQueryKey = (url: string) =>
  ['theorem', 'link-preview', url] as const

const MAX_OVERLOAD_RETRIES = 3
const MAX_RETRY_DELAY_MS = 10_000

const HTTP_MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')
const HTTP_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

// All three case-sensitive wire forms from RFC 9110 section 5.6.7.
// Date.parse also accepts non-HTTP syntax and normalizes impossible dates.
// https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.7
function httpDateTimestamp(value: string, now: number): number {
  const namedDate =
    /^([A-Z][a-z]{2}), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    ) ??
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    )
  const asctime = namedDate
    ? null
    : /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) (\d{2}| \d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
        value,
      )
  const parts =
    namedDate?.slice(1) ??
    (asctime
      ? [
          asctime[1],
          asctime[3],
          asctime[2],
          asctime[7],
          asctime[4],
          asctime[5],
          asctime[6],
        ]
      : null)
  if (!parts) return NaN
  const [
    weekday = '',
    dayText = '',
    monthText = '',
    yearText = '',
    hourText = '',
    minuteText = '',
    secondText = '',
  ] = parts
  const month = HTTP_MONTHS.indexOf(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (month < 0 || hour > 23 || minute > 59 || second > 60) return NaN
  let year = Number(yearText)
  const clockParts = [month, day, hour, minute, Math.min(second, 59)] as const
  const leapSecond = second === 60 ? 1_000 : 0

  if (yearText.length === 2) {
    // RFC850 uses a rolling fifty-year window, not JavaScript's fixed pivot.
    const boundary = new Date(now)
    boundary.setUTCFullYear(boundary.getUTCFullYear() + 50)
    year += Math.floor(boundary.getUTCFullYear() / 100) * 100
    if (Date.UTC(year, ...clockParts) + leapSecond > boundary.getTime())
      year -= 100
  }

  // Validate the original calendar day before normalizing a leap second.
  const date = new Date(Date.UTC(year, ...clockParts))
  const expectedWeekday = HTTP_WEEKDAYS[date.getUTCDay()]
  if (
    year < 1900 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    !expectedWeekday ||
    (yearText.length === 2 ? expectedWeekday : expectedWeekday.slice(0, 3)) !==
      weekday
  )
    return NaN
  return date.getTime() + leapSecond
}

function retryAfterDelay(hint: string | null): number {
  // Only HTTP optional whitespace may surround a field value.
  const value = hint?.replace(/^[\t ]+|[\t ]+$/g, '')
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value) * 1_000
  const now = Date.now()
  const date = httpDateTimestamp(value, now)
  return Number.isFinite(date) ? Math.max(0, date - now) : 0
}

class PreviewOverloadedError extends Error {
  readonly retryAfterMs: number

  constructor(hint: string | null) {
    super('link preview: 503')
    this.retryAfterMs = retryAfterDelay(hint)
  }
}

/**
 * One URL's preview metadata. `null` means the server could read none (the
 * page failed, refused, or carries no metadata): the caller falls back to a
 * plain hyperlink, never a broken card. Only temporary overload retries:
 * at most three retries with 1/2/4-second backoff, honoring reasonable server
 * delays. Scheduled waits total at most 30 seconds, excluding request time.
 * Missing metadata becomes stale with the server's five-minute negative cache,
 * while successful metadata keeps its longer freshness window.
 */
export function useLinkMetadata(url: string | undefined) {
  return useQuery({
    queryKey: linkMetadataQueryKey(url ?? ''),
    enabled: url !== undefined,
    staleTime: (query) =>
      query.state.data === null ? 5 * 60_000 : 30 * 60_000,
    retry: (failureCount, error) =>
      error instanceof PreviewOverloadedError &&
      error.retryAfterMs <= MAX_RETRY_DELAY_MS &&
      failureCount < MAX_OVERLOAD_RETRIES,
    retryDelay: (failureCount, error) =>
      Math.min(
        MAX_RETRY_DELAY_MS,
        Math.max(
          1_000 * 2 ** failureCount,
          error instanceof PreviewOverloadedError ? error.retryAfterMs : 0,
        ),
      ),
    queryFn: async (): Promise<LinkMetadata | null> => {
      const response = await fetch(
        `/api/link-preview/v1/?url=${encodeURIComponent(url!)}`,
        { headers: { accept: 'application/json' } },
      )
      if (response.status === 404 || response.status === 400) return null
      if (response.status === 503)
        throw new PreviewOverloadedError(response.headers.get('retry-after'))
      if (!response.ok) throw new Error(`link preview: ${response.status}`)
      return metadataSchema.parse(await response.json())
    },
  })
}
