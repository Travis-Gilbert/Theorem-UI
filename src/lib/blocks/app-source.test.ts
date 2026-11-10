// SOURCING: bun:test over a TypeScript App's source form (app-source.ts) and
// its build into a hosted page (export.ts, hosted-app.ts), with esbuild-wasm.
import { describe, expect, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import { typescriptApp } from '../../../test/blocks/typescript-app'
import { AppBuildError, appSourcesOf, problemText } from './app-source'
import type { AppProblem } from './app-source'
import { bundleAppSources } from './export'
import { hostedApp, hostedBuild } from './hosted-app'

const problemsOf = async (work: () => unknown): Promise<Array<AppProblem>> => {
  try {
    await work()
  } catch (error) {
    if (error instanceof AppBuildError) return error.problems
    throw error
  }
  return []
}

describe("an App's source files", () => {
  test('a plain HTML App carries none', () => {
    expect(appSourcesOf('<p>Hello</p><script>run()</script>')).toBeNull()
  })

  test('they are read by path, and the App starts from main.tsx', () => {
    const sources = appSourcesOf(
      typescriptApp({
        'main.tsx': "import { Table } from './components/Table'",
        'components/Table.tsx': 'export const Table = () => <table />',
      }),
    )
    expect(Object.keys(sources!.files)).toEqual([
      'main.tsx',
      'components/Table.tsx',
    ])
    expect(sources!.entry).toBe('main.tsx')
    expect(sources!.files['components/Table.tsx']).toContain('<table />')
  })

  test('a marked file is the entry', () => {
    const html = typescriptApp(
      { 'main.tsx': '', 'start.ts': '' },
      { entry: 'start.ts' },
    )
    expect(appSourcesOf(html)!.entry).toBe('start.ts')
  })

  test('paths outside the App, repeats and a missing entry are named', async () => {
    const outside = await problemsOf(() =>
      appSourcesOf(typescriptApp({ '../other.ts': '' })),
    )
    expect(outside[0]?.message).toContain('is not a source path')
    const twice = await problemsOf(() =>
      appSourcesOf(
        `<script type="text/theorem-source" data-path="main.ts"></script><script type="text/theorem-source" data-path="main.ts"></script>`,
      ),
    )
    expect(twice[0]).toMatchObject({ file: 'main.ts', kind: 'build' })
    const none = await problemsOf(() =>
      appSourcesOf(typescriptApp({ 'lib.ts': '' })),
    )
    expect(none[0]?.message).toContain('No file to start from')
  })
})

describe('building an App', () => {
  test('its files and what they import become one module', async () => {
    const sources = appSourcesOf(
      typescriptApp({
        'main.tsx': `import { createRoot } from 'react-dom/client'
import { Greeting } from './Greeting'
import './look.css'
createRoot(document.getElementById('root')!).render(<Greeting name="Alder" />)`,
        'Greeting.tsx': `export function Greeting({ name }: { name: string }) {
  return <p className="greeting">Hello {name}</p>
}`,
        'look.css': '.greeting { color: rebeccapurple }',
      }),
    )!
    const bundle = await bundleAppSources(sources, esbuild)
    expect(bundle.code).toContain('Hello ')
    expect(bundle.code).not.toContain('{ name: string }')
    expect(bundle.css).toContain('rebeccapurple')
    const map = JSON.parse(bundle.map) as { sources: Array<string> }
    // The App's own files, and none of the modules they import.
    expect(map.sources.sort()).toEqual(
      ['Greeting.tsx', 'look.css', 'main.tsx'].filter((file) =>
        map.sources.includes(file),
      ),
    )
    expect(map.sources).toContain('main.tsx')
    expect(map.sources).toContain('Greeting.tsx')
  }, 60_000)

  test('a file that does not parse is a problem at its line', async () => {
    const problems = await problemsOf(() =>
      bundleAppSources(
        appSourcesOf(
          typescriptApp({
            'main.tsx': "import { value } from './value'\nconsole.log(value)",
            'value.ts': 'export const value = 1\nexport const = 2',
          }),
        )!,
        esbuild,
      ),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      kind: 'build',
      file: 'value.ts',
      line: 2,
    })
    expect(problemText(problems[0]!)).toStartWith('value.ts:2:')
  }, 60_000)

  test('an import of a file the App lacks, or a module outside the import map, is refused', async () => {
    const missing = await problemsOf(() =>
      bundleAppSources(
        appSourcesOf(typescriptApp({ 'main.ts': "import './absent'" }))!,
        esbuild,
      ),
    )
    expect(missing[0]?.message).toContain('No file "./absent" in this App')
    const outside = await problemsOf(() =>
      bundleAppSources(
        appSourcesOf(typescriptApp({ 'main.ts': "import 'lodash'" }))!,
        esbuild,
      ),
    )
    expect(outside[0]?.message).toContain("not in the blocks' import map")
    const above = await problemsOf(() =>
      bundleAppSources(
        appSourcesOf(typescriptApp({ 'main.ts': "import '../../etc'" }))!,
        esbuild,
      ),
    )
    expect(above[0]?.message).toContain('in this App')
  }, 60_000)
})

describe('a hosted TypeScript App', () => {
  test('runs its bundle as the last thing in the page, in place of its sources', async () => {
    const html = typescriptApp(
      { 'main.ts': 'document.title = "built" satisfies string' },
      { uses: 'db("records")' },
    )
    const hosted = await hostedApp(html, esbuild)
    const page = new DOMParser().parseFromString(hosted.page, 'text/html')
    expect(page.querySelector('script[type="text/theorem-source"]')).toBeNull()
    const bundle = page.querySelector('script[data-theorem-app-bundle]')
    expect(bundle?.getAttribute('type')).toBe('module')
    expect(bundle?.textContent).toContain('document.title = "built"')
    expect(page.body.lastElementChild).toBe(bundle)
    // The bridge is still first, and the policy is the hosted App's.
    expect(page.head.children[1]?.hasAttribute('data-theorem-app-bridge')).toBe(
      true,
    )
    expect(JSON.parse(hosted.build!.map).sources).toEqual(['main.ts'])
    // The page says how it was built, to whoever holds only the page.
    expect(hostedBuild(hosted.page)).toEqual(hosted.build)
    // The bundle starts on the line after its tag.
    const lines = hosted.page.split('\n')
    expect(lines[hosted.build!.scriptLine - 1]).toContain(
      'data-theorem-app-bundle',
    )
  }, 60_000)

  test('a plain HTML App is hosted as before, with nothing built', async () => {
    const hosted = await hostedApp('<p>Plain</p>', esbuild)
    expect(hosted.build).toBeUndefined()
    expect(hosted.page).toContain('<p>Plain</p>')
  }, 60_000)

  test('a source that does not build is refused with its problems', async () => {
    const problems = await problemsOf(() =>
      hostedApp(typescriptApp({ 'main.ts': 'const = 1' }), esbuild),
    )
    expect(problems[0]).toMatchObject({
      kind: 'build',
      file: 'main.ts',
      line: 1,
    })
  }, 60_000)
})
