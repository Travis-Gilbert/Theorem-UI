// SOURCING: bun:test over the Index's own-place navigator, rendered with
// React into happy-dom (test/workspace's render). The URL place needs the
// router and is exercised in the browser instead.
import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanup, render } from '../../../test/workspace'
import { useLocalIndexPlace } from './navigation'
import type { IndexPlace } from './navigation'

afterEach(cleanup)

test('a place of its own moves like the /index URL: a view keeps the open item, a collection starts afresh', async () => {
  let place: IndexPlace | undefined
  function Probe() {
    place = useLocalIndexPlace({ view: 'home.recent' })
    return null
  }
  await render(<Probe />)
  expect(place!.search).toMatchObject({
    view: 'home.recent',
    scope: { kind: 'home' },
  })

  act(() => place!.navigate.openItem('doc-1'))
  act(() => place!.navigate.openView('home.links', { kind: 'home' }))
  expect(place!.search).toMatchObject({ view: 'home.links', item: 'doc-1' })

  act(() => place!.navigate.openCollection('c-1'))
  expect(place!.search).toEqual({
    collection: 'c-1',
    scope: { kind: 'collection', collectionId: 'c-1' },
  })

  act(() => place!.navigate.openItem('doc-2'))
  act(() => place!.navigate.closeItem())
  expect(place!.search.item).toBeUndefined()
  expect(place!.search.scope).toEqual({
    kind: 'collection',
    collectionId: 'c-1',
  })
})
