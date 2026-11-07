// SOURCING: copied from mikecann/threadbear@78b77e1 runner/src/highlights.ts (MIT, Copyright (c) 2026 Mike Cann): linkItem, linkTitle, linksIn, commitsIn. Threadbear is an app, not a package, so there is nothing to depend on. The one change: linksIn drops its branch for file paths, because a browser cannot stat them; files come from Theorem's uploads and artifacts instead.

export type FoundLink = {
  id: string
  kind: 'pr' | 'link'
  title: string
  url: string
}

const PR_URL = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i

export function linkItem(url: string): FoundLink {
  // Trailing punctuation and Markdown emphasis ("**https://x.dev**") aren't
  // part of the address, and a bare origin's "/" would make
  // "localhost:5176" and "localhost:5176/" two rows.
  const clean = url
    .replace(/[).,;:!?'"*_~]+$/, '')
    .replace(/^(https?:\/\/[^/?#]+)\/$/i, '$1')
  const pr = PR_URL.exec(clean)
  if (pr) {
    const prUrl = pr[0]
    return {
      id: `pr:${prUrl}`,
      kind: 'pr',
      title: `${pr[1]}/${pr[2]}#${pr[3]}`,
      url: prUrl,
    }
  }
  return { id: `link:${clean}`, kind: 'link', title: linkTitle(clean), url: clean }
}

// "github.com/mikecann/poddle/pull/19" without the scheme, cut down.
function linkTitle(url: string): string {
  const t = url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  return t.length > 80 ? `${t.slice(0, 79)}…` : t
}

// Links in an agent's reply: Markdown links (their text is the title) and
// bare URLs. Code blocks are skipped: what's in them is output to read, not
// something handed over.
export function linksIn(text: string): FoundLink[] {
  const out = new Map<string, FoundLink>()
  const prose = text.replace(/```[\s\S]*?(```|$)/g, ' ')
  const addUrl = (raw: string, title?: string) => {
    const item = linkItem(raw)
    if (
      out.has(item.id) ||
      !/^https?:\/\/[^\s/]+\.[^\s/]|^https?:\/\/(localhost|127\.0\.0\.1)/i.test(
        item.url,
      )
    )
      return
    if (title && item.kind === 'link' && title.trim() && title.trim() !== item.url)
      item.title = title.trim().slice(0, 200)
    out.set(item.id, item)
  }
  // [text](target)
  let rest = prose.replace(
    /\[([^\]\n]{0,300})\]\(([^)\s]+)\)/g,
    (_, title: string, target: string) => {
      if (/^https?:\/\//i.test(target)) addUrl(target, title.replace(/`/g, ''))
      return ' '
    },
  )
  // `url`
  rest = rest.replace(/`([^`\n]+)`/g, (_, inner: string) => {
    if (/^https?:\/\/\S+$/i.test(inner)) addUrl(inner)
    return ' '
  })
  for (const m of rest.matchAll(/https?:\/\/[^\s<>()[\]`"']+/gi)) addUrl(m[0])
  return [...out.values()]
}

// `[main 91aba3e] App: hold ⌘ to see the keys` from git commit.
export function commitsIn(
  text: string,
): Array<{ branch: string; sha: string; message: string }> {
  const out: Array<{ branch: string; sha: string; message: string }> = []
  for (const m of text.matchAll(
    /^\[([^\s\]]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/gm,
  )) {
    out.push({
      branch: m[1]!,
      sha: m[2]!.slice(0, 7),
      message: m[3]!.trim().slice(0, 200),
    })
  }
  return out
}

// The row under `step` from the selected one, for the arrow keys. With
// nothing selected, the first going down and the last going up. From
// web/src/sections.ts in the same commit.
export function neighbour(
  order: readonly string[],
  selected: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = selected === undefined ? -1 : order.indexOf(selected)
  if (at < 0) return step === 1 ? order[0] : order.at(-1)
  return order[at + step]
}
