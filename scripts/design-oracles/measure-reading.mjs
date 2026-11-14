// Independent rendered calibration: native Range geometry and Intl.Segmenter.
// No general-purpose text-layout library measures the browser's shaped glyph
// fragments. Production tokens are observations, never expected constants.
import { LATIN_PROSE_V1_PARAGRAPHS, LATIN_PROSE_V1_SHA256 } from './corpus.mjs'

export async function measureReading(page) {
  return page.evaluate(
    async ({ paragraphs, hash }) => {
      await document.fonts.ready
      const source = document.querySelector(
        '[data-appearance-part="prose-track"] p, .aui-md-p',
      )
      if (!source)
        return {
          result: 'not-measurable',
          reason: 'No actual transcript paragraph',
        }
      const style = getComputedStyle(source)
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const segments = (text) => [...segmenter.segment(text)]
      const host = document.createElement('div')
      host.setAttribute('aria-hidden', 'true')
      Object.assign(host.style, {
        position: 'fixed',
        left: '-20000px',
        top: '0',
        visibility: 'hidden',
        width: 'max-content',
        contain: 'layout style',
      })
      document.body.append(host)
      const make = (text, fontSize = 16) => {
        const p = document.createElement('p')
        p.textContent = text
        Object.assign(p.style, {
          fontFamily: style.fontFamily,
          fontSize: `${fontSize}px`,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          fontStretch: style.fontStretch,
          fontFeatureSettings: style.fontFeatureSettings,
          fontVariant: style.fontVariant,
          fontKerning: style.fontKerning,
          fontSynthesis: style.fontSynthesis,
          lineHeight: '1.5',
          letterSpacing: 'normal',
          wordSpacing: 'normal',
          margin: '0',
          padding: '0',
          border: '0',
          whiteSpace: 'normal',
          wordBreak: 'normal',
          overflowWrap: 'normal',
          textIndent: '0',
        })
        host.append(p)
        return p
      }
      const countLines = (p) => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
        const lines = []
        let node
        while ((node = walker.nextNode())) {
          for (const { segment, index } of segments(node.textContent)) {
            const range = document.createRange()
            range.setStart(node, index)
            range.setEnd(node, index + segment.length)
            const boxes = [...range.getClientRects()]
            if (!boxes.length) continue
            // A range may have overlapping fragment rectangles. Count each
            // grapheme once at its first nonempty fragment, including spaces.
            const rect = boxes.find((box) => box.height > 0) ?? boxes[0]
            const line = lines.find(
              (line) => Math.abs(line.top - rect.top) <= 0.5,
            )
            if (line) line.count++
            else lines.push({ top: rect.top, count: 1 })
          }
        }
        lines.sort((a, b) => a.top - b.top)
        return lines.slice(0, -1).map((line) => line.count)
      }
      const stats = (lines) => {
        const ordered = [...lines].sort((a, b) => a - b)
        return {
          eligibleLines: lines.length,
          lineCounts: lines,
          median: ordered.length
            ? (ordered[Math.floor((ordered.length - 1) / 2)] +
                ordered[Math.ceil((ordered.length - 1) / 2)]) /
              2
            : null,
          p90: ordered.length
            ? ordered[Math.ceil(ordered.length * 0.9) - 1]
            : null,
        }
      }
      try {
        let advances = 0,
          graphemes = 0
        for (const text of paragraphs) {
          const p = make(text)
          p.style.width = 'max-content'
          p.style.whiteSpace = 'nowrap'
          const range = document.createRange()
          range.selectNodeContents(p)
          advances += range.getBoundingClientRect().width
          graphemes += segments(text).length
          p.remove()
        }
        const meanAdvance = advances / graphemes
        const profiles = {}
        for (const [name, target, low, high, p90Limit] of [
          ['comfortable', 80, 65, 90, 105],
          ['wide', 100, 85, 110, 125],
        ]) {
          const width = Math.floor((target * meanAdvance) / 4 + 0.5) * 4
          const lines = []
          for (const text of paragraphs) {
            const p = make(text)
            p.style.width = `${width}px`
            lines.push(...countLines(p))
            p.remove()
          }
          const observed = stats(lines)
          profiles[name] = {
            preferredPxAt16: width,
            preferredEm: width / 16,
            ...observed,
            result:
              observed.eligibleLines < 20
                ? 'not-measurable'
                : observed.median >= low &&
                    observed.median <= high &&
                    observed.p90 <= p90Limit
                  ? 'pass'
                  : 'review',
          }
        }
        const actualParagraphs = [
          ...document.querySelectorAll('.aui-md-p'),
        ].filter((p) =>
          paragraphs.includes(p.textContent.replace(/\s+/g, ' ').trim()),
        )
        const actual = stats(actualParagraphs.flatMap(countLines))
        const track =
          source.closest('[data-appearance-part="prose-track"]') ?? source
        return {
          result: Object.values(profiles).every((p) => p.result === 'pass')
            ? 'pass'
            : 'review',
          corpusSha256: hash,
          font: {
            family: style.fontFamily,
            weight: style.fontWeight,
            features: style.fontFeatureSettings,
            referenceSize: 16,
          },
          totalUnwrappedAdvance: advances,
          graphemes,
          meanAdvance,
          profiles,
          actual: {
            ...actual,
            paragraphCount: actualParagraphs.length,
            trackWidth: track.getBoundingClientRect().width,
            fontSize: parseFloat(style.fontSize),
          },
        }
      } finally {
        host.remove()
      }
    },
    { paragraphs: LATIN_PROSE_V1_PARAGRAPHS, hash: LATIN_PROSE_V1_SHA256 },
  )
}
