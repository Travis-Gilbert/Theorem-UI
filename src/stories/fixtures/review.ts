// SOURCING: none: the App gallery review from docs/plans/evidence/refs/sidebar-compare@2026-11-05.webp, typed against lib/theorem/reviews. Its two images are wireframes drawn here, since the reference's thumbnails are not separable assets.
import type { Review } from '@/lib/theorem/reviews'

const INK = '#8f8f8f'
const LINE = '#3a3a3a'
const row = (y: number, width: number, x = 24) =>
  `<rect x="${x}" y="${y}" width="${width}" height="8" rx="4" fill="${INK}" opacity="0.55"/>`

const frame = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300"><rect width="480" height="300" fill="#191919"/><rect x="12" y="12" width="456" height="276" rx="8" fill="none" stroke="${LINE}"/>${body}</svg>`

const groups = frame(
  [0, 1].map((column) =>
    [0, 1, 2].map((group) => {
      const x = 28 + column * 220
      const y = 30 + group * 84
      return `<rect x="${x}" y="${y}" width="204" height="72" rx="6" fill="#222" stroke="${LINE}"/><rect x="${x + 12}" y="${y + 12}" width="84" height="8" rx="4" fill="${INK}"/>${row(y + 32, 150, x + 12)}${row(y + 48, 110, x + 12)}`
    }).join(''),
  ).join(''),
)

const compact = frame(
  Array.from({ length: 9 }, (_, index) => {
    const y = 28 + index * 28
    return `<circle cx="36" cy="${y + 4}" r="5" fill="${INK}" opacity="0.7"/>${row(y, 180 + ((index * 37) % 120), 52)}<line x1="24" x2="456" y1="${y + 17}" y2="${y + 17}" stroke="${LINE}"/>`
  }).join(''),
)

export const reviewShots: Readonly<Record<string, string>> = {
  'shot-groups': groups,
  'shot-compact': compact,
}

export function reviewFixture(now: number): Review {
  const shot = (shotId: string, uploadId: string) => ({
    shotId,
    mime: 'image/svg+xml',
    width: 480,
    height: 300,
    sha256: shotId,
    source: { uploadId },
  })
  return {
    schema: 'theorem-review/1',
    reviewId: 'review-app-gallery',
    threadId: 'thread-app-gallery',
    runId: 'run-gallery',
    title: 'App gallery',
    note: 'Choose a direction',
    status: 'open',
    revision: 1,
    createdAtMs: now - 8 * 60_000,
    options: [
      {
        id: 'option-groups',
        title: 'Project groups',
        shots: [shot('shot-groups', 'upload-groups')],
      },
      {
        id: 'option-compact',
        title: 'Compact list',
        shots: [shot('shot-compact', 'upload-compact')],
      },
    ],
    draft: {
      pickedIds: ['option-groups'],
      none: false,
      reply: "Use A's groups with B's compact rows.",
      observations: [],
    },
  }
}
