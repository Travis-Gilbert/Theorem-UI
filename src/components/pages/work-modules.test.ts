// SOURCING: bun:test over how the work tracker is composed into the Index: its OpenUI components, its builtin modules, its page templates, and what each offers while the tracker is off. Pure, no React
import { describe, expect, test } from 'bun:test'
import { checkProgram } from '@/components/index/validate'
import {
  libraryComponents,
  libraryPrompt,
  libraryRecord,
} from '@/components/index/library'
import { WORK_COMPONENT_NAMES } from '@/components/work/library'
import { workProgram } from '@/components/work/programs'
import type { WorkScreen } from '@/components/work/route'
import { findCycle, validateConnections } from '@/lib/modules/connections'
import { allModules, moduleById } from '@/lib/modules/registry'
import { BUILTIN_TEMPLATES } from '@/lib/modules/templates'
import { WORK_TEMPLATES, templateOffered } from '@/lib/modules/work-templates'
import { pageConfig } from './puck-config'
import { BUILTIN_MODULES } from './builtins'

const WORK_MODULE_IDS = [
  'theorem.work.inbox',
  'theorem.work.list',
  'theorem.work.board',
  'theorem.work.viewbar',
  'theorem.work.item',
  'theorem.work.projects',
  'theorem.work.project',
]

describe('OpenUI components', () => {
  test('every named component is in the library while the tracker is on, and none while it is off', () => {
    const on = libraryComponents(true)
    const off = libraryComponents(false)
    for (const name of WORK_COMPONENT_NAMES) {
      expect(on).toContain(name)
      expect(off).not.toContain(name)
    }
    // Positive control: the rest of the library is in both.
    expect(off).toContain('Stack')
    expect(on.length - off.length).toBe(WORK_COMPONENT_NAMES.length)
  })

  test('the prompt Theorem composes with names the tracker only while it is on', async () => {
    for (const name of WORK_COMPONENT_NAMES) {
      expect(libraryPrompt(true)).toContain(name)
      expect(libraryPrompt(false)).not.toContain(name)
    }
    const [on, off] = await Promise.all([libraryRecord(true), libraryRecord(false)])
    expect(on.digest).not.toBe(off.digest)
    expect(on.components).toContain('WorkInbox')
    expect(off.components).not.toContain('WorkInbox')
  })

  test('every screen the tracker adds to the Index is a program the library parses', () => {
    const screens: WorkScreen[] = [
      { kind: 'inbox' },
      { kind: 'projects' },
      { kind: 'project', projectId: 'p1' },
      ...['my-issues', 'active', 'high-priority', 'review-requests', 'all-issues', 'board'].map(
        (viewId): WorkScreen => ({ kind: 'view', viewId }),
      ),
    ]
    for (const screen of screens)
      expect(checkProgram(workProgram(screen).program, {})).toEqual({
        ok: true,
        problems: [],
      })
  })

  test('programs composed from the components parse, and an unknown component does not', () => {
    const ok = checkProgram(
      [
        'root = Stack([bar, list])',
        'bar = WorkViewBar("active")',
        'list = WorkList("active", "github")',
      ].join('\n'),
      {},
    )
    expect(ok.problems).toEqual([])
    expect(checkProgram('root = WorkNothing()', {}).ok).toBe(false)
  })
})

describe('builtin modules', () => {
  test('the seven are registered under Work', () => {
    for (const id of WORK_MODULE_IDS) {
      expect(moduleById(id)?.category).toBe('Work')
      expect(BUILTIN_MODULES.map((m) => m.id)).toContain(id)
    }
    expect(allModules().filter((m) => m.category === 'Work')).toHaveLength(WORK_MODULE_IDS.length)
  })

  test('lists and boards take a view, a source and a bar; the detail takes an item in', () => {
    for (const id of ['theorem.work.list', 'theorem.work.board']) {
      const module = moduleById(id)!
      expect(module.settings.map((s) => s.name)).toEqual(['view', 'source', 'bar'])
      expect(module.outputs.map((o) => o.name)).toEqual(['selected'])
      expect(module.events.map((e) => e.name)).toEqual(['opened'])
      expect(module.actions.map((a) => a.name)).toEqual(['select', 'deselect'])
    }
    expect(moduleById('theorem.work.item')!.inputs.map((i) => [i.name, i.type])).toEqual([
      ['item', 'item'],
    ])
    expect(moduleById('theorem.work.inbox')!.settings.map((s) => s.name)).toEqual(['state'])
    expect(moduleById('theorem.work.project')!.settings[0]).toMatchObject({
      name: 'project',
      resource: 'work-project',
    })
  })

  test('the module pickers drop the Work category while the tracker is off, and still render what holds it', () => {
    const on = pageConfig(allModules(), true)
    const off = pageConfig(allModules(), false)
    expect(on.categories?.work?.visible).toBe(true)
    expect(off.categories?.work?.visible).toBe(false)
    // A saved page that holds a Work module can still draw it (as the tracker-is-off state).
    expect(Object.keys(off.components)).toContain('theorem.work.list')
    expect(on.categories?.work?.components).toEqual(expect.arrayContaining(WORK_MODULE_IDS))
  })
})

describe('page templates', () => {
  test('ten templates are shipped and are among the built-ins', () => {
    expect(WORK_TEMPLATES).toHaveLength(10)
    for (const template of WORK_TEMPLATES) expect(BUILTIN_TEMPLATES).toContain(template)
    expect(WORK_TEMPLATES.map((t) => t.title)).toEqual(
      expect.arrayContaining([
        'Work inbox',
        'My issues',
        'Active work',
        'High priority',
        'Review requests',
        'All issues',
        'Work board',
        'Work projects',
        'Work project',
        'GitHub work',
      ]),
    )
  })

  test('connections are valid for the builtin modules, with no value cycle', () => {
    for (const template of WORK_TEMPLATES) {
      expect(validateConnections(template.layout, (type) => moduleById(type))).toEqual([])
      expect(findCycle(template.layout)).toBeUndefined()
    }
  })

  test('the list and the item are wired: the selection goes in, a linked item comes back', () => {
    const template = WORK_TEMPLATES.find((t) => t.id === 'theorem.work.my-issues')!
    const split = template.layout.content[0]!
    const second = (split.props.second as Array<{ props: Record<string, unknown> }>)[0]!
    expect(second.props.bind).toEqual({ item: { from: 'list', port: 'selected' } })
    expect(second.props.on).toEqual({
      opened: [{ to: { instance: 'list', action: 'select' } }],
    })
  })

  test('the GitHub template is the same composition narrowed to GitHub', () => {
    const github = WORK_TEMPLATES.find((t) => t.title === 'GitHub work')!
    const split = github.layout.content[0]!
    const first = (split.props.first as Array<{ type: string; props: Record<string, unknown> }>)[0]!
    expect(first.type).toBe('theorem.work.list')
    expect(first.props.source).toBe('github')
    expect(github.feature).toBe('github')
  })

  test('what is offered follows the two switches; templates that are not the tracker are always offered', () => {
    const work = WORK_TEMPLATES.find((t) => t.feature === 'work')!
    const github = WORK_TEMPLATES.find((t) => t.feature === 'github')!
    const plain = BUILTIN_TEMPLATES.find((t) => t.feature === undefined)!
    for (const [tracker, expected] of [
      [{ work: true, github: true }, [true, true, true]],
      [{ work: true, github: false }, [true, false, true]],
      [{ work: false, github: true }, [false, false, true]],
      [{ work: false, github: false }, [false, false, true]],
    ] as const)
      expect([work, github, plain].map((t) => templateOffered(t, tracker))).toEqual([
        ...expected,
      ])
  })
})
