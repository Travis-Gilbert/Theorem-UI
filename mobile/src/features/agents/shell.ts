// SOURCING: POSIX sh (quoting, quoted here-documents, brace groups), tmux(1) list-panes / load-buffer / paste-buffer -p / send-keys / new-session -P, ps(1) -A -o, awk; the fallback PATH is Remux's RemoteProgramCommand.fallbackPath
//
// Every script runs as `exec /bin/sh -s` with the script on stdin (see
// modules/theorem-session), so the computer's login shell, whether bash, zsh or
// fish, parses nothing Theorem writes. The body is one brace group read from
// /dev/null: sh parses all of it before running any of it, so no command can
// read the rest of the script as its input. Data a script carries, such as a
// message to type, goes in a quoted here-document with a random delimiter, so
// it is never expanded or run.

/** Single-quotes one word for sh. */
export const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** Where package managers put tmux, claude and codex when the login PATH lacks them (Remux's list). */
const fallbackPath = [
  '$HOME/.local/bin',
  '$HOME/.local/share/mise/shims',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/local/bin',
  '/home/linuxbrew/.linuxbrew/bin',
  '$HOME/.nix-profile/bin',
  '/nix/var/nix/profiles/default/bin',
  '/run/current-system/sw/bin',
  '/snap/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
].join(':')

/** Marks the start of a script's own output, after anything the computer's startup files printed. */
export const MARK = '@@theorem'

export function script(...lines: string[]): string {
  return [
    `PATH="\${PATH:+$PATH:}${fallbackPath}"`,
    'export PATH',
    // Byte semantics for awk length, wc and cut.
    'LC_ALL=C',
    'export LC_ALL',
    '{',
    `printf '%s\\n' ${quote(MARK)}`,
    ...lines,
    '} </dev/null',
    '',
  ].join('\n')
}

/**
 * A here-document that hands `text` to `command` on stdin. The command runs in
 * a brace group so the document reaches its first reader, whatever pipes and
 * substitutions it contains. Trailing newlines of `text` are dropped by `$(cat)`.
 */
export function heredoc(command: string, text: string, token: string): string {
  const delimiter = `THEOREM_${token.replace(/[^A-Za-z0-9]/g, '')}`
  if (text.split('\n').includes(delimiter)) throw new Error('The message contains its own delimiter.')
  return `{ ${command}; } <<'${delimiter}'\n${text}\n${delimiter}`
}

/** The lines a script printed after its marker, or undefined if it never printed it. */
export function afterMark(stdout: string): string[] | undefined {
  const lines = stdout.split('\n')
  const start = lines.indexOf(MARK)
  if (start === -1) return undefined
  const rest = lines.slice(start + 1)
  if (rest.at(-1) === '') rest.pop()
  return rest
}

export type Agent = 'claude' | 'codex'
export const agentName: Record<Agent, string> = { claude: 'Claude Code', codex: 'Codex' }

const mtimeFunction = 'mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }'
const findLogs = (agent: Agent) =>
  agent === 'claude'
    ? `find "$HOME/.claude/projects" -name '*.jsonl'`
    : `find "$HOME/.codex/sessions" -name 'rollout-*.jsonl'`
const folder = (cwd: string) => (cwd === '~' ? '"$HOME"' : quote(cwd))

/**
 * Lists what can be talked to on a computer: tmux panes, the processes that
 * might be agents inside them, and recent Claude Code and Codex logs.
 *
 * Lines, tab-separated:
 *   pane  <pane id> <session> <pane pid> <current path>
 *   tmux  missing
 *   proc  <pid> <ppid>
 *   args  <pid> <arguments, cut to 300 bytes>
 *   log   <agent> <mtime seconds> <size bytes> <path>
 *   cwd   <path> <"cwd":"…" fragment from the log>
 *   title <path> <JSON fragment from the log, cut>
 */
const paneLines = [
  'tab=$(printf "\\t")',
  'if command -v tmux >/dev/null 2>&1; then',
  `  tmux list-panes -a -F "pane\${tab}#{pane_id}\${tab}#{session_name}\${tab}#{pane_pid}\${tab}#{pane_current_path}" 2>/dev/null`,
  'else',
  '  printf "tmux\\tmissing\\n"',
  'fi',
  `ps -A -o pid= -o ppid= 2>/dev/null | awk '{ printf "proc\\t%s\\t%s\\n", $1, $2 }'`,
  `ps -A -o pid= -o args= 2>/dev/null | grep -i -e claude -e codex | cut -c1-300 | awk '{ pid = $1; sub(/^ *[0-9]+ +/, ""); printf "args\\t%s\\t%s\\n", pid, $0 }'`,
]

export function discoveryScript(days = 14, limit = 24): string {
  return script(
    ...paneLines,
    mtimeFunction,
    '{',
    `  ${findLogs('claude')} -mtime -${days} 2>/dev/null | sed 's/^/claude /'`,
    `  ${findLogs('codex')} -mtime -${days} 2>/dev/null | sed 's/^/codex /'`,
    '} | while read -r agent path; do',
    '  printf "%s\\t%s\\t%s\\n" "$(mtime "$path")" "$agent" "$path"',
    `done | sort -rn | head -n ${limit} | while IFS="$tab" read -r when agent path; do`,
    '  printf "log\\t%s\\t%s\\t%s\\t%s\\n" "$agent" "$when" "$(wc -c < "$path" | tr -d " ")" "$path"',
    `  printf "cwd\\t%s\\t%s\\n" "$path" "$(grep -m 1 -o '"cwd":"[^"]*"' "$path" | head -n 1)"`,
    '  if [ "$agent" = claude ]; then',
    `    title=$(grep '"type":"ai-title"' "$path" | tail -n 1 | cut -c1-400)`,
    `    [ -n "$title" ] || title=$(grep -m 1 '"type":"user","message":{"role":"user","content":"' "$path" | cut -c1-1200)`,
    '  else',
    `    title=$(grep -m 1 '"type":"user_message"' "$path" | cut -c1-600)`,
    '  fi',
    '  printf "title\\t%s\\t%s\\n" "$path" "$title"',
    'done',
  )
}

/**
 * What one conversation needs to know each few seconds: the panes and agent
 * processes (as discoveryScript prints them), and `newer <path>` for each log
 * of the same agent and folder written after this one: a pane in that folder
 * writes the newest of them, so this conversation has ended.
 */
export function liveScript(agent: Agent, path: string, cwd: string | undefined): string {
  const marker = cwd === undefined ? undefined : `"cwd":${JSON.stringify(cwd)}`
  return script(
    ...paneLines,
    marker === undefined
      ? ':'
      : [
          `${findLogs(agent)} -newer ${quote(path)} 2>/dev/null | while read -r other; do`,
          `  [ "$other" = ${quote(path)} ] && continue`,
          `  grep -m 1 -o '"cwd":"[^"]*"' "$other" | head -n 1 | grep -F -q -x -e ${quote(marker)} || continue`,
          '  printf "newer\\t%s\\n" "$other"',
          'done',
        ].join('\n'),
  )
}

const OVERSIZED_AWK = [
  'function emit(line,   id) {',
  '  if (length(line) <= max) { print line; return }',
  '  id = ""',
  '  if (match(line, /"tool_use_id":"[^"]*"/)) id = substr(line, RSTART + 15, RLENGTH - 16)',
  '  else if (match(line, /"call_id":"[^"]*"/)) id = substr(line, RSTART + 11, RLENGTH - 12)',
  '  printf "{\\"type\\":\\"theorem-oversized\\",\\"bytes\\":%d,\\"id\\":\\"%s\\"}\\n", length(line), id',
  '}',
  '{ if (held) { if (!(skip && first)) emit(prev); first = 0 } else first = 1; prev = $0; held = 1; used += length($0) + 1 }',
  'END {',
  '  if (!held) { print "@@used 0"; exit }',
  '  if (used <= total) { if (!(skip && first)) emit(prev); print "@@used " used }',
  '  else print "@@used " (used - length(prev) - 1)',
  '}',
].join('\n')

export type ReadOptions = {
  /** Bytes read per command; Remux captures at most 64 KB of output. */
  limit?: number
  /** Lines longer than this are replaced by a `theorem-oversized` marker. */
  oversized?: number
  /** Drop the first line: a read that starts mid-file usually starts mid-line. */
  skipPartial?: boolean
}

/**
 * Reads whole lines of a log from byte `offset`, at most `limit` bytes. A
 * negative `offset` counts back from the end of the file, and the first
 * (partial) line is then dropped unless the read starts at byte 0.
 * Prints `@@size <file size>`, `@@from <offset read from>`, the lines, then
 * `@@used <bytes consumed after that offset>`, or `@@missing` when the file is gone.
 */
export function readScript(
  path: string,
  offset: number,
  { limit = 56_000, oversized = 40_000, skipPartial = false }: ReadOptions = {},
): string {
  return script(
    `f=${quote(path)}`,
    `lim=${limit}`,
    `skip=${skipPartial ? 1 : 0}`,
    '[ -r "$f" ] || { printf "@@missing\\n"; exit 0; }',
    'size=$(wc -c < "$f" | tr -d " ")',
    offset < 0
      ? `off=$((size - ${Math.floor(-offset)})); if [ "$off" -gt 0 ]; then skip=1; else off=0; fi`
      : `off=${Math.floor(offset)}`,
    'printf "@@size %s\\n@@from %s\\n" "$size" "$off"',
    '[ "$off" -lt "$size" ] || { printf "@@used 0\\n"; exit 0; }',
    'total=$((size - off)); [ "$total" -gt "$lim" ] && total=$lim',
    `tail -c +$((off + 1)) "$f" | head -c "$lim" | awk -v total="$total" -v max=${oversized} -v skip="$skip" '${OVERSIZED_AWK}'`,
  )
}

/**
 * The length in bytes, newline included, of the line that starts at `offset`,
 * once another line follows it; 0 before then. Used to step over one line
 * longer than a whole read.
 */
export function lineLengthScript(path: string, offset: number): string {
  return script(
    `tail -c +${Math.max(0, Math.floor(offset)) + 1} ${quote(path)} | awk 'NR == 1 { n = length($0) + 1; next } { more = 1; exit } END { print (more ? n : 0) }'`,
  )
}

/** Types `text` into a pane as one bracketed paste, then presses Enter. */
export function sendScript(pane: string, text: string, token: string): string {
  const buffer = `theorem-${token.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}`
  return script(
    heredoc(`text=$(cat); printf '%s' "$text" | tmux load-buffer -b ${buffer} -`, text, token),
    `tmux paste-buffer -p -d -b ${buffer} -t ${quote(pane)} || exit 3`,
    // Let the agent take the paste before Enter submits it.
    'sleep 0.3',
    `tmux send-keys -t ${quote(pane)} Enter || exit 3`,
    'printf "sent\\n"',
  )
}

/** Presses Escape in the pane: how Claude Code and Codex interrupt the turn in progress. */
export function interruptScript(pane: string): string {
  return script(`tmux send-keys -t ${quote(pane)} Escape || exit 3`, 'printf "sent\\n"')
}

/**
 * Starts the agent in a new detached tmux session in `cwd`, with the first
 * message as its prompt. Prints `started <session> <pane id> <epoch seconds>`,
 * or `missing tmux|claude|codex|folder`.
 */
export function startScript(agent: Agent, cwd: string, text: string, session: string, token: string): string {
  return script(
    'command -v tmux >/dev/null 2>&1 || { printf "missing\\ttmux\\n"; exit 0; }',
    `program=$(command -v ${agent}) || { printf "missing\\t${agent}\\n"; exit 0; }`,
    `dir=${folder(cwd)}`,
    '[ -d "$dir" ] || { printf "missing\\tfolder\\n"; exit 0; }',
    heredoc('prompt=$(cat)', text, token),
    'now=$(date +%s)',
    `pane=$(tmux new-session -d -P -F '#{pane_id}' -s ${quote(session)} -c "$dir" -- "$program" "$prompt") || exit 3`,
    `printf "started\\t%s\\t%s\\t%s\\n" ${quote(session)} "$pane" "$now"`,
  )
}

/**
 * Finds the newest log the agent wrote for `cwd` since `since` (epoch
 * seconds). Prints `log <path>`, or nothing yet.
 */
export function findStartedLogScript(agent: Agent, cwd: string, since: number): string {
  return script(
    `dir=${folder(cwd)}`,
    'real=$(cd "$dir" 2>/dev/null && pwd -P) || real=$dir',
    mtimeFunction,
    `${findLogs(agent)} -mmin -120 2>/dev/null | while read -r path; do`,
    `  when=$(mtime "$path"); [ "\${when:-0}" -ge ${Math.floor(since)} ] || continue`,
    `  grep -m 1 -o '"cwd":"[^"]*"' "$path" | grep -F -q -x -e "\\"cwd\\":\\"$dir\\"" -e "\\"cwd\\":\\"$real\\"" || continue`,
    '  printf "%s\\t%s\\n" "$when" "$path"',
    `done | sort -rn | head -n 1 | awk '{ sub(/^[0-9]+\\t/, ""); print "log\\t" $0 }'`,
  )
}
