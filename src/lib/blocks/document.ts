// SOURCING: hand-rolled. What every block document shares, wherever it is
// served: the block listener's cell and app documents and an exported tool.
// A Content-Security-Policy is a header string and the directives are the
// ones plan D9 fixes; no library models either.

/** The base style of a block document: system type, room for the output. */
export const BLOCK_DOCUMENT_STYLE = `:root{color-scheme:light dark;font:14px/1.5 system-ui,sans-serif}
body{margin:0;padding:8px;background:transparent;overflow-wrap:anywhere}
pre{margin:0;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap}
.theorem-display+.theorem-display{margin-top:8px}`

/** `connect-src`: nothing, unless the block declared `net("host")`. */
export const connectSources = (hosts: Array<string>) =>
  hosts.length ? hosts.map((host) => `https://${host}`).join(' ') : "'none'"

/** A policy from its directives, in order. */
export const contentSecurityPolicy = (directives: Record<string, string>) =>
  Object.entries(directives)
    .map(([name, value]) => `${name} ${value}`)
    .join('; ')
