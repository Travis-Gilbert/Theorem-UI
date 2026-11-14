import { chromium, firefox, webkit } from 'playwright-core'
import { resolve } from 'node:path'

export const reviewOutput = resolve(
  process.env.ORACLE_REVIEW_OUT ?? 'docs/plans/composable-appearance/evidence/review',
)

export function launchReviewBrowser(engine = 'chromium') {
  const browser = { chromium, firefox, webkit }[engine]
  if (!browser) throw new Error(`Unknown review browser: ${engine}`)
  // Match the real composer e2e runner. Chromium's separate headless shell
  // can stall on macOS while the installed full browser paints normally.
  return browser.launch(engine === 'chromium' ? { channel: 'chromium' } : {})
}
