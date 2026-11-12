// SOURCING: none. Small encodings Theorem's uploads route asks for (the web's src/lib/theorem/imports.ts sends the same headers).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Unpadded base64url of a string's UTF-8 bytes; file names go in a header this way. */
export function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]
    if (c !== undefined) out += ALPHABET[c & 63]
  }
  return out
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

/** The type the picker reported, else one read from the name. Theorem checks the bytes itself. */
export function mimeOf(name: string, reported?: string | null): string {
  if (reported && reported !== 'application/octet-stream') return reported
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  return TYPES[extension] ?? reported ?? 'application/octet-stream'
}

/** A name that is safe as a path component and still says what the file is. */
export function safeName(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? '').replace(/[\\/:\0]/g, '_').trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback
}

export function sizeWords(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
