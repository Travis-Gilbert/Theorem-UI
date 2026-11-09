// SOURCING: bun:test spies on Web Crypto. A Cloudflare Worker refuses random
// values in module scope, so importing a library must not draw any: building
// one at import failed every server request on theorem.rs.
import { expect, spyOn, test } from 'bun:test'

test('importing the OpenUI libraries draws no random values', async () => {
  const uuid = spyOn(crypto, 'randomUUID')
  const bytes = spyOn(crypto, 'getRandomValues')
  try {
    const { artifactLibrary } = await import('./library')
    const { indexLibrary } = await import('../../index/library')
    expect(uuid).not.toHaveBeenCalled()
    expect(bytes).not.toHaveBeenCalled()
    // Built on first use instead, and once.
    expect(artifactLibrary()).toBe(artifactLibrary())
    expect(indexLibrary()).toBe(indexLibrary())
  } finally {
    uuid.mockRestore()
    bytes.mockRestore()
  }
  // A cold import of both libraries and their views is slow.
}, 60_000)
