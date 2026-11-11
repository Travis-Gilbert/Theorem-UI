import { afterEach, describe, expect, test } from 'bun:test'
import { thingProps } from '@/lib/face/things'
import { forget, locate, reveal, spanOf, thingsOnPage } from './things'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Gives an element the room the test says it takes; without this it takes none. */
function measured<T extends Element>(element: T, rect: Rect): T {
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  })
  return element
}

function make(
  tag: string,
  attributes: Record<string, string> = {},
  children: Array<Node | string> = [],
) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes))
    element.setAttribute(name, value)
  element.append(...children)
  return element
}

const frames = async (count: number) => {
  for (let frame = 0; frame < count; frame++)
    await new Promise((resolve) => requestAnimationFrame(resolve))
}

afterEach(() => {
  document.body.replaceChildren()
  forget()
})

describe('finding words', () => {
  test('across the nodes a page cuts its text into', () => {
    const root = make('p', {}, [
      'The build ',
      make('code', {}, ['exit']),
      make('em', {}, [' code 1']),
      ' after the tests.',
    ])
    const span = spanOf(root, 'exit code 1')
    expect(span?.start.data).toBe('exit')
    expect(span?.startOffset).toBe(0)
    expect(span?.end.data).toBe(' code 1')
    expect(span?.endOffset).toBe(7)
  })

  test('a line break on the page is a space to whoever quotes it', () => {
    const root = make('pre', {}, ['error:\n    cannot  find\tmodule'])
    const span = spanOf(root, 'error: cannot find module')
    expect(span?.startOffset).toBe(0)
    expect(span?.endOffset).toBe(root.textContent.length)
  })

  test('as written first, then whatever the case', () => {
    const root = make('p', {}, ['Failed, then failed again'])
    expect(spanOf(root, 'failed')?.startOffset).toBe(13)
    expect(spanOf(root, 'FAILED AGAIN')?.startOffset).toBe(13)
  })

  test('into an open shadow root, and not into a style', () => {
    const host = make('div')
    host
      .attachShadow({ mode: 'open' })
      .append(
        make('style', {}, ['.line { color: red }']),
        make('div', { 'data-line': '3' }, ['const total = sum(rows)']),
      )
    expect(spanOf(host, 'sum(rows)')?.startOffset).toBe(14)
    expect(spanOf(host, 'color: red')).toBeUndefined()
  })

  test('words in what is not drawn are passed over for the same words where they show', () => {
    // An artifact's newest revision kept, hidden, before the older one the person has open.
    const hidden = make('div', { hidden: '' }, [
      make('h2', {}, ['What is left']),
    ])
    const styled = make('div', { style: 'display: none' }, ['What is left'])
    const showing = make('h2', {}, ['What is left'])
    const root = make('section', {}, [
      hidden,
      styled,
      make('div', {}, [showing]),
    ])
    document.body.append(root)
    expect(spanOf(root, 'What is left')?.start.parentElement).toBe(showing)
    showing.remove()
    expect(spanOf(root, 'What is left')).toBeUndefined()
  })

  test('words that are not there are not found', () => {
    const root = make('p', {}, ['one two'])
    expect(spanOf(root, 'three')).toBeUndefined()
    expect(spanOf(root, '   ')).toBeUndefined()
  })
})

describe('the things on a page', () => {
  test('are listed by name with what became of them, the newest last', () => {
    document.body.append(
      measured(
        make('div', thingProps('message', 'm1', { label: 'the question' })),
        { left: 100, top: 20, width: 400, height: 40 },
      ),
      measured(
        make(
          'div',
          thingProps('tool', 'c1', { label: 'Run tests', state: 'failed' }),
        ),
        { left: 100, top: 80, width: 400, height: 30 },
      ),
      make('div', { 'data-face-thing': 'not a name' }),
    )
    expect(thingsOnPage()).toEqual([
      { name: 'message:m1', label: 'the question', where: 'in view' },
      {
        name: 'tool:c1',
        label: 'Run tests',
        state: 'failed',
        where: 'in view',
      },
    ])
  })

  test('a thing that takes no room is closed, and found by what holds it', () => {
    const holder = measured(make('div', { 'data-face-holder': '' }), {
      left: 100,
      top: 200,
      width: 180,
      height: 24,
    })
    holder.append(
      make('span', { hidden: '' }, [
        make('span', thingProps('tool', 'c1', { state: 'failed' })),
      ]),
    )
    document.body.append(holder)
    expect(thingsOnPage()).toEqual([
      { name: 'tool:c1', state: 'failed', where: 'closed' },
    ])
    const found = locate({ thing: 'tool:failed' }, 0)
    expect(found).toMatchObject({
      name: 'tool:c1',
      closed: true,
      box: { left: 100, top: 200, right: 280, bottom: 224 },
    })
    expect(locate({ thing: 'tool:c2' }, 0)).toBeUndefined()
    expect(locate({ thing: 'artifact:last' }, 0)).toBeUndefined()
  })

  test('named twice, the one that takes room is the thing', () => {
    const card = measured(make('div', thingProps('tool', 'c1')), {
      left: 100,
      top: 300,
      width: 400,
      height: 30,
    })
    document.body.append(card, make('span', thingProps('tool', 'c1')))
    expect(thingsOnPage()).toEqual([{ name: 'tool:c1', where: 'in view' }])
    expect(locate({ thing: 'tool:c1' }, 0)?.closed).toBe(false)
  })

  test('a numbered line is found where a diff draws it, added before taken away', () => {
    const change = measured(make('div', thingProps('change', 'd/a.ts')), {
      left: 100,
      top: 100,
      width: 600,
      height: 200,
    })
    const diff = make('diffs-container')
    const added = measured(
      make('div', { 'data-line': '12', 'data-line-type': 'change-addition' }, [
        'const total = sum(rows)',
      ]),
      { left: 140, top: 180, width: 560, height: 20 },
    )
    diff
      .attachShadow({ mode: 'open' })
      .append(
        make('div', { 'data-line': '12', 'data-column-number': '12' }, ['12']),
        measured(
          make(
            'div',
            { 'data-line': '12', 'data-line-type': 'change-deletion' },
            ['const total = 0'],
          ),
          { left: 140, top: 160, width: 560, height: 20 },
        ),
        added,
      )
    change.append(diff)
    document.body.append(change)
    expect(locate({ thing: 'change:d/a.ts', line: 12 }, 0)).toMatchObject({
      part: { left: 140, top: 180, right: 700, bottom: 200 },
      partKind: 'line',
    })
    forget()
    expect(
      locate({ thing: 'change:d/a.ts', line: 99 }, 0)?.part,
    ).toBeUndefined()
  })
})

describe('a thing drawn twice, and a thing cut off', () => {
  test('the element that shows the whole of it is the thing while both are there', () => {
    const panel = measured(
      make('section', thingProps('artifact', 'a1', { whole: true })),
      { left: 700, top: 0, width: 500, height: 700 },
    )
    const card = measured(make('div', thingProps('artifact', 'a1')), {
      left: 100,
      top: 300,
      width: 400,
      height: 200,
    })
    document.body.append(panel, card)
    expect(locate({ thing: 'artifact:a1' }, 0)?.box.left).toBe(700)
    panel.remove()
    forget()
    expect(locate({ thing: 'artifact:a1' }, 0)?.box.left).toBe(100)
  })

  test('a clip that is itself out of sight leaves what the person sees as it was', () => {
    const scroller = measured(make('div', { style: 'overflow-y: auto' }), {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    })
    const excerpt = measured(make('div', { style: 'overflow-y: hidden' }), {
      left: 100,
      top: 900,
      width: 400,
      height: 200,
    })
    const card = measured(make('div', thingProps('artifact', 'a1')), {
      left: 100,
      top: 860,
      width: 400,
      height: 240,
    })
    const heading = measured(make('h2', {}, ['What is left']), {
      left: 110,
      top: 1_200,
      width: 120,
      height: 24,
    })
    excerpt.append(heading)
    card.append(excerpt)
    scroller.append(card)
    document.body.append(scroller)
    const found = locate({ thing: 'artifact:a1' }, 0)
    // The scroller's box, not the nothing where it and the excerpt overlap.
    expect(found?.view).toMatchObject({ top: 0, bottom: 600 })
  })

  test('a part a preview cuts off is not scrolled inside it: what shows the whole of the thing is pressed', async () => {
    const scrolled: Array<string> = []
    const excerpt = measured(make('div', { style: 'overflow-y: hidden' }), {
      left: 100,
      top: 300,
      width: 400,
      height: 200,
    })
    const heading = make('h2', {}, ['What is left'])
    heading.scrollIntoView = () => void scrolled.push('excerpt heading')
    excerpt.scrollIntoView = () => void scrolled.push('excerpt')
    excerpt.append(heading)
    const open = make('button', { 'data-face-opens': '' })
    const card = measured(make('div', thingProps('artifact', 'a1')), {
      left: 100,
      top: 240,
      width: 400,
      height: 260,
    })
    card.append(open, excerpt)
    document.body.append(card)
    // Words are measured by a range, which this DOM gives no room: say where they are.
    const rects = (top: number) =>
      [
        {
          left: 110,
          top,
          right: 230,
          bottom: top + 24,
          width: 120,
          height: 24,
        },
      ] as unknown as DOMRectList
    const range = Range.prototype.getClientRects
    Range.prototype.getClientRects = function () {
      return rects(this.startContainer.parentElement === heading ? 900 : 120)
    }
    try {
      let opened = 0
      open.addEventListener('click', () => {
        opened++
        const panel = measured(
          make('section', thingProps('artifact', 'a1', { whole: true })),
          { left: 700, top: 0, width: 500, height: 700 },
        )
        const whole = make('h2', {}, ['What is left'])
        whole.scrollIntoView = () => void scrolled.push('panel heading')
        panel.append(whole)
        document.body.append(panel)
      })
      reveal({ thing: 'artifact:a1', text: 'What is left' }, false)
      await frames(5)
      expect(opened).toBe(1)
      expect(scrolled).toEqual(['panel heading'])
      // With nothing to show the whole of it, the excerpt itself is brought.
      document.body.querySelector('section')?.remove()
      open.remove()
      scrolled.length = 0
      reveal({ thing: 'artifact:a1', text: 'What is left' }, false)
      await frames(50)
      expect(scrolled).toEqual(['excerpt'])
    } finally {
      Range.prototype.getClientRects = range
    }
  })
})

describe('bringing a thing to the person', () => {
  /** A fold as the page draws one: a control that says it is closed, and what it opens. */
  function fold(name: Record<string, string>, opened: () => HTMLElement) {
    const holder = measured(make('div', { 'data-face-holder': '' }), {
      left: 100,
      top: 200,
      width: 180,
      height: 24,
    })
    const control = make('button', { 'aria-expanded': 'false' }, ['Details'])
    const marker = make('span', { hidden: '' }, [make('span', name)])
    let presses = 0
    control.addEventListener('click', () => {
      presses++
      control.setAttribute('aria-expanded', 'true')
      marker.remove()
      holder.append(opened())
    })
    holder.append(control, marker)
    document.body.append(holder)
    return { presses: () => presses }
  }

  test('what folds it away is opened by its own control, once, and it is scrolled to', async () => {
    const scrolled: Array<unknown> = []
    const card = measured(make('div', thingProps('tool', 'c1')), {
      left: 100,
      top: 2_000,
      width: 400,
      height: 30,
    })
    card.scrollIntoView = (how) => void scrolled.push(how)
    const details = fold(thingProps('tool', 'c1'), () => card)
    reveal({ thing: 'tool:c1' }, false)
    await frames(4)
    expect(details.presses()).toBe(1)
    expect(scrolled).toEqual([
      { block: 'center', inline: 'nearest', behavior: 'auto' },
    ])
    expect(locate({ thing: 'tool:c1' })?.closed).toBe(false)
  })

  test('a thing that is open but lacks the part asked for has its own fold opened, and no menu', async () => {
    const card = measured(make('div', thingProps('tool', 'c1')), {
      left: 100,
      top: 300,
      width: 400,
      height: 30,
    })
    card.scrollIntoView = () => {}
    const menu = make('button', {
      'aria-expanded': 'false',
      'aria-haspopup': 'menu',
    })
    let menus = 0
    menu.addEventListener('click', () => menus++)
    const toggle = make('button', { 'aria-expanded': 'false' }, ['Run tests'])
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'true')
      card.append(make('pre', {}, ['error: exit code 1']))
    })
    card.append(menu, toggle)
    document.body.append(card)
    reveal({ thing: 'tool:c1', text: 'exit code 1' }, false)
    await frames(4)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(menus).toBe(0)
  })

  test('a thing that will not open is pressed once and left alone', async () => {
    const holder = measured(make('div', { 'data-face-holder': '' }), {
      left: 100,
      top: 200,
      width: 180,
      height: 24,
    })
    const control = make('button', { 'aria-expanded': 'false' })
    let presses = 0
    control.addEventListener('click', () => presses++)
    holder.scrollIntoView = () => {}
    holder.append(
      control,
      make('span', { hidden: '' }, [make('span', thingProps('tool', 'c1'))]),
    )
    document.body.append(holder)
    reveal({ thing: 'tool:c1' }, false)
    await frames(60)
    expect(presses).toBe(1)
  })
})
