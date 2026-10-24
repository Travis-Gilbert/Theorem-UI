// SOURCING: none — which platform element shows a MIME type's top level.

export type MediaKind = 'image' | 'audio' | 'video'

/** Which element shows a file of this MIME type, if any. */
export function mediaKind(mime: string | null): MediaKind | null {
  const kind = mime?.slice(0, mime.indexOf('/'))
  return kind === 'image' || kind === 'audio' || kind === 'video' ? kind : null
}
