// SOURCING: hand-rolled. A template is a page layout to start from: two are
// built in (the Index and the coding layouts the shell shipped as fixed
// surfaces, rebuilt from modules), others are page files a person saved to
// the vault's Templates folder. Index and IDE mode render from their page,
// `Modes/<mode>.page.json`, else from their template.
import type { LayoutData, PageDocument } from './contract'
import { PAGE_SCHEMA, PAGE_SUFFIX } from './contract'
import { WORK_TEMPLATES } from './work-templates'

export const TEMPLATES_FOLDER = 'Templates'
export const MODES_FOLDER = 'Modes'

export const isTemplatePath = (path: string) =>
  path.startsWith(`${TEMPLATES_FOLDER}/`) &&
  path.endsWith(PAGE_SUFFIX) &&
  !path.slice(TEMPLATES_FOLDER.length + 1).includes('/')

export interface PageTemplate {
  /** `theorem.index` for a built-in, the file's path for one in the vault. */
  id: string
  title: string
  description?: string
  origin: 'builtin' | 'vault'
  /** What has to be switched on for the template to be offered; absent for all. */
  feature?: 'work' | 'github'
  layout: LayoutData
}

/**
 * The Index: a view that moves with the panel beside the rail, and an
 * inspector beside it for the item open there. The inspector's side keeps
 * its width and folds away while nothing is open; closing it, opening a
 * linked item and Edit fields go back to the view.
 */
export const INDEX_TEMPLATE: PageTemplate = {
  id: 'theorem.index',
  title: 'Index',
  description:
    'An Index view with an inspector beside it for the item open in it.',
  origin: 'builtin',
  layout: {
    root: { props: { fill: true, frames: 'flush' } },
    content: [
      {
        type: 'theorem.split',
        props: {
          id: 'index-split',
          direction: 'row',
          ratio: 50,
          fixed: 'second',
          size: 400,
          fold: true,
          height: 560,
          first: [
            {
              type: 'theorem.index.view',
              props: {
                id: 'view',
                title: 'View',
                v: 1,
                view: '',
                follows: 'panel',
              },
            },
          ],
          second: [
            {
              type: 'theorem.index.inspector',
              props: {
                id: 'inspector',
                title: 'Inspector',
                v: 1,
                bind: { item: { from: 'view', port: 'selected' } },
                on: {
                  closed: [{ to: { instance: 'view', action: 'deselect' } }],
                  opened: [{ to: { instance: 'view', action: 'select' } }],
                  editFields: [
                    { to: { instance: 'view', action: 'openFields' } },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
  },
}

/**
 * Coding: the conversation with Theia beside it, each open file Theia's own
 * tab. Theia's Add to chat goes to the conversation's composer, and Follow
 * follows the conversation's runs.
 */
export const CODING_TEMPLATE: PageTemplate = {
  id: 'theorem.coding',
  title: 'Coding',
  description:
    "The conversation with Theia beside it; Add to chat goes to the conversation's composer.",
  origin: 'builtin',
  layout: {
    root: { props: { fill: true, frames: 'flush' } },
    content: [
      {
        type: 'theorem.split',
        props: {
          id: 'coding-split',
          direction: 'row',
          ratio: 42,
          fixed: 'none',
          size: 420,
          fold: false,
          height: 560,
          first: [
            {
              type: 'theorem.conversation',
              props: { id: 'conversation', title: 'Conversation', v: 1 },
            },
          ],
          second: [
            {
              type: 'theorem.ide',
              props: {
                id: 'ide',
                title: 'IDE',
                v: 1,
                chat: 'conversation',
                on: {
                  added: [
                    { to: { instance: 'conversation', action: 'attach' } },
                  ],
                },
              },
            },
          ],
        },
      },
    ],
  },
}

export const BUILTIN_TEMPLATES: ReadonlyArray<PageTemplate> = [
  INDEX_TEMPLATE,
  CODING_TEMPLATE,
  ...WORK_TEMPLATES,
]

/** The modes that are pages: where each is kept, and what it starts as. */
export const MODE_PAGES = {
  index: { title: 'Index mode', template: INDEX_TEMPLATE },
  ide: { title: 'IDE mode', template: CODING_TEMPLATE },
} as const
export type PageMode = keyof typeof MODE_PAGES

export const isPageMode = (value: string): value is PageMode =>
  Object.hasOwn(MODE_PAGES, value)

export const modePagePath = (mode: PageMode) =>
  `${MODES_FOLDER}/${mode}${PAGE_SUFFIX}`

export const isModePagePath = (path: string) =>
  (Object.keys(MODE_PAGES) as PageMode[]).some(
    (mode) => modePagePath(mode) === path,
  )

/** A new page with the template's layout, a copy it can change freely. */
export function pageFromTemplate(
  template: Pick<PageTemplate, 'layout'> | undefined,
  title: string,
): PageDocument {
  return {
    schema: PAGE_SCHEMA,
    title,
    pinned: false,
    layout: template
      ? structuredClone(template.layout)
      : { root: { props: {} }, content: [] },
  }
}

/** A mode's page as its template makes it. */
export const modeTemplatePage = (mode: PageMode) =>
  pageFromTemplate(MODE_PAGES[mode].template, MODE_PAGES[mode].title)
