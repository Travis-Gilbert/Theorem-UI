/*
 * The task-list adapter and companion rich-text renderer adapt assistant-ui code:
 * Copyright (c) 2026 AgentbaseAI Inc. (MIT License)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// SOURCING: assistant-ui's native markdown-text.tsx (MIT), react-native-marked 8.3.4 / marked 18.1.3.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react-native/assistant-ui/elements/markdown-text.tsx
import { Tokenizer } from 'marked'

type ListToken = NonNullable<ReturnType<Tokenizer['list']>>
type ListItem = ListToken['items'][number]

/** The native parser does not render checkbox tokens. Keep the state in its inline text. */
function foldTaskBox(item: ListItem, lexer: Tokenizer['lexer']): void {
  const boxIndex = item.tokens.findIndex((token) => token.type === 'checkbox')
  const target = item.tokens[boxIndex === -1 ? 0 : boxIndex + 1]
  if (!target || (target.type !== 'text' && target.type !== 'paragraph')) return
  const text = `${item.checked ? '☑' : '☐'} ${target.text.replace(/^\[[ xX]\][ \t]+/, '')}`
  target.text = text
  target.raw = text
  // Marked queues inline work by value; use the new queue's array in the token the native parser reads.
  target.tokens = lexer.inline(text, [])
}

export class NativeTaskListTokenizer extends Tokenizer {
  override list(source: string) {
    const list = super.list(source)
    if (list) for (const item of list.items) if (item.task) foldTaskBox(item, this.lexer)
    return list
  }
}

function markdownUrl(value: string | undefined): URL | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return undefined
  try {
    return new URL(text)
  } catch {
    return undefined
  }
}

/** Web destinations stay in the retained, contextual browser. */
export function markdownWebUrl(value: string | undefined): string | undefined {
  const url = markdownUrl(value)
  return url && (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? url.href : undefined
}

/** Preserve the existing email-link handoff; no other app or executable scheme is opened. */
export function markdownLinkUrl(value: string | undefined): string | undefined {
  const url = markdownUrl(value)
  if (url?.protocol === 'mailto:') return url.href
  return url && (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? url.href : undefined
}

/** Markdown images never interpret HTML or SVG payloads. Other files keep their readable alt text. */
export function markdownImageUrl(value: string): string | undefined {
  return markdownWebUrl(value) ??
    (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z\d+/=\s]+$/i.test(value) ? value : undefined)
}

export function markdownCodeLanguage(info: string | undefined): string {
  return info?.trim().split(/\s+/, 1)[0]?.slice(0, 40) || 'text'
}
