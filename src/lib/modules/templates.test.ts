// SOURCING: bun:test over the template catalog; pure, no React.
import { expect, test } from 'bun:test'
import { PAGE_SCHEMA, pageText, parsePage } from './contract'
import { findCycle } from './connections'
import {
  BUILTIN_TEMPLATES,
  INDEX_TEMPLATE,
  MODE_PAGES,
  isPageMode,
  isTemplatePath,
  modePagePath,
  modeTemplatePage,
  pageFromTemplate,
} from './templates'

test('every built-in template is a page file that parses, with no value cycle', () => {
  for (const template of BUILTIN_TEMPLATES) {
    const page = pageFromTemplate(template, template.title)
    const path = `Pages/${template.title}.page.json`
    expect(parsePage(path, pageText(page))).toEqual(page)
    expect(findCycle(page.layout)).toBeUndefined()
  }
})

test('a page from a template is a copy: changing it leaves the template as it was', () => {
  const before = JSON.stringify(INDEX_TEMPLATE.layout)
  const page = pageFromTemplate(INDEX_TEMPLATE, 'Desk')
  page.layout.content.length = 0
  expect(JSON.stringify(INDEX_TEMPLATE.layout)).toBe(before)
  expect(page).toMatchObject({
    schema: PAGE_SCHEMA,
    title: 'Desk',
    pinned: false,
  })
  expect(pageFromTemplate(undefined, 'Blank').layout).toEqual({
    root: { props: {} },
    content: [],
  })
})

test('templates are page files directly in Templates; modes are pages in Modes', () => {
  expect(isTemplatePath('Templates/Desk.page.json')).toBe(true)
  expect(isTemplatePath('Templates/old/Desk.page.json')).toBe(false)
  expect(isTemplatePath('Pages/Desk.page.json')).toBe(false)
  expect(isTemplatePath('Templates/Desk.md')).toBe(false)
  expect(modePagePath('index')).toBe('Modes/index.page.json')
  expect(isPageMode('ide')).toBe(true)
  expect(isPageMode('chat')).toBe(false)
  expect(isPageMode('constructor')).toBe(false)
  for (const mode of Object.keys(MODE_PAGES) as Array<keyof typeof MODE_PAGES>)
    expect(modeTemplatePage(mode).title).toBe(MODE_PAGES[mode].title)
})
