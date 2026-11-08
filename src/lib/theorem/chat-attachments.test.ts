import { describe, expect, test } from 'bun:test'
import { chatAttachments, turnUploads } from './chat-attachments'
import type { Theorem } from './client'

const stored = {
  messageId: 'm1',
  role: 'user',
  parts: [
    { partId: 'text', type: 'text', payload: { text: 'Which?' } },
    { partId: 'attachment:u1', type: 'attachment', payload: { uploadId: 'u1' } },
  ],
} as unknown as Theorem.Message

describe('turnUploads', () => {
  test('a new message carries what the composer holds', () => {
    expect(turnUploads('Which?', ['u2'], undefined)).toEqual(['u2'])
  })

  test('unchanged text is a retry, which Theorem refuses uploads on', () => {
    expect(turnUploads('Which?', [], stored)).toEqual([])
  })

  test('an edit keeps what the message held, and adds to it once', () => {
    expect(turnUploads('Which one?', ['u1', 'u2'], stored)).toEqual(['u1', 'u2'])
  })
})

describe('chatAttachments', () => {
  test('an image previews as an image, anything else as a document', async () => {
    const adapter = chatAttachments(() => Promise.resolve('p'))
    const added = (file: File) => adapter.add({ file }) as Promise<{ type: string }>
    expect((await added(new File(['x'], 'a.png', { type: 'image/png' }))).type).toBe('image')
    expect((await added(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).type).toBe('document')
  })
})
