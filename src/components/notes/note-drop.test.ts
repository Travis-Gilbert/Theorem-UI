import { describe, expect, test } from 'bun:test'
import type {
  Active,
  ClientRect,
  DroppableContainer,
  UniqueIdentifier,
} from '@dnd-kit/core'
import type { NoteFolder } from '@/lib/theorem/note-folders'
import { INTO, SECTION, collide, dropSteps } from './note-drop'

const folder = (collectionId: string, parentId: string | null = null) =>
  ({ collectionId, name: collectionId, parentId }) satisfies NoteFolder

// Recipes holds Soups; the note doc:filed is in Recipes.
const filed = {
  folders: [folder('coll:recipes'), folder('coll:soups', 'coll:recipes')],
  folderOf: new Map([['doc:filed', 'coll:recipes']]),
}

describe('dropSteps', () => {
  test('nothing under the pointer does nothing', () => {
    expect(dropSteps('note:doc:loose', null, filed)).toEqual([])
  })

  test('a section dropped on another takes its place', () => {
    expect(dropSteps(`${SECTION}agents`, `${SECTION}notes`, filed)).toEqual([
      { kind: 'move-section', section: 'agents', to: 'notes' },
    ])
  })

  test('a section dropped on a folder stays where it was', () => {
    expect(dropSteps(`${SECTION}agents`, `${INTO}coll:recipes`, filed)).toEqual(
      [],
    )
  })

  test('a loose note dropped on a folder is filed there', () => {
    expect(dropSteps('note:doc:loose', `${INTO}coll:soups`, filed)).toEqual([
      { kind: 'file', documentId: 'doc:loose', to: 'coll:soups' },
    ])
  })

  test('a note dropped on the folder it is in stays', () => {
    expect(dropSteps('note:doc:filed', `${INTO}coll:recipes`, filed)).toEqual(
      [],
    )
  })

  test('a folder dropped on another goes inside it', () => {
    expect(dropSteps('folder:coll:recipes', `${INTO}coll:other`, filed)).toEqual(
      [{ kind: 'nest', folderId: 'coll:recipes', into: 'coll:other' }],
    )
  })

  test('a folder dropped on a folder inside it stays', () => {
    expect(
      dropSteps('folder:coll:recipes', `${INTO}coll:soups`, filed),
    ).toEqual([])
  })

  test('a loose note dropped on a section is placed there', () => {
    expect(dropSteps('note:doc:loose', `${SECTION}folders`, filed)).toEqual([
      { kind: 'place', item: 'note:doc:loose', section: 'folders' },
    ])
  })

  test('a note in a folder dropped on a section comes out to sit there', () => {
    expect(dropSteps('note:doc:filed', `${SECTION}folders`, filed)).toEqual([
      { kind: 'file', documentId: 'doc:filed', to: null },
      { kind: 'place', item: 'note:doc:filed', section: 'folders' },
    ])
  })

  test('a folder inside another dropped on a section goes to the top level there', () => {
    expect(dropSteps('folder:coll:soups', `${SECTION}notes`, filed)).toEqual([
      { kind: 'nest', folderId: 'coll:soups', into: null },
      { kind: 'place', item: 'folder:coll:soups', section: 'notes' },
    ])
  })

  test("the agents' folder dropped on a section is placed there", () => {
    expect(dropSteps('agents', `${SECTION}notes`, filed)).toEqual([
      { kind: 'place', item: 'agents', section: 'notes' },
    ])
  })

  test('something that is no row does nothing', () => {
    expect(dropSteps('elsewhere', `${SECTION}notes`, filed)).toEqual([])
  })
})

describe('collide', () => {
  const rect = (top: number, height: number): ClientRect => ({
    top,
    height,
    bottom: top + height,
    left: 0,
    width: 200,
    right: 200,
  })
  // Two sections stacked; a folder row inside the first.
  const rects = new Map<UniqueIdentifier, ClientRect>([
    [`${SECTION}folders`, rect(0, 100)],
    [`${INTO}coll:recipes`, rect(20, 20)],
    [`${SECTION}notes`, rect(100, 100)],
  ])
  const container = (id: string): DroppableContainer => ({
    id,
    key: id,
    data: { current: undefined },
    disabled: false,
    node: { current: null },
    rect: { current: rects.get(id) ?? null },
  })
  const hits = (dragged: string, x: number, y: number, dragRect = rect(y, 10)) => {
    const active: Active = {
      id: dragged,
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    }
    return collide({
      active,
      collisionRect: dragRect,
      droppableRects: rects,
      droppableContainers: [...rects.keys()].map((id) => container(String(id))),
      pointerCoordinates: { x, y },
    }).map((hit) => hit.id)
  }

  test('a note over a folder goes into the folder before the section around it', () => {
    expect(hits('note:doc:1', 10, 30)).toEqual([
      `${INTO}coll:recipes`,
      `${SECTION}folders`,
    ])
  })

  test('the folder comes first even when the section is nearer the pointer', () => {
    // A folder row taller than the short section it overlaps.
    const tall = new Map<UniqueIdentifier, ClientRect>([
      [`${SECTION}folders`, rect(0, 40)],
      [`${INTO}coll:recipes`, rect(0, 400)],
    ])
    const active: Active = {
      id: 'note:doc:1',
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    }
    const ids = collide({
      active,
      collisionRect: rect(10, 10),
      droppableRects: tall,
      droppableContainers: [...tall.keys()].map((id) => container(String(id))),
      pointerCoordinates: { x: 10, y: 10 },
    }).map((hit) => hit.id)
    expect(ids).toEqual([`${INTO}coll:recipes`, `${SECTION}folders`])
  })

  test('a folder over a folder can go inside it', () => {
    expect(hits('folder:coll:soups', 10, 30)[0]).toBe(`${INTO}coll:recipes`)
  })

  test("the agents' folder only goes into a section", () => {
    expect(hits('agents', 10, 30)).toEqual([`${SECTION}folders`])
  })

  test('a section goes to the section nearest its middle, never a folder', () => {
    expect(hits(`${SECTION}notes`, 10, 30, rect(25, 10))[0]).toBe(
      `${SECTION}folders`,
    )
    expect(hits(`${SECTION}notes`, 10, 30, rect(25, 10))).not.toContain(
      `${INTO}coll:recipes`,
    )
  })
})
