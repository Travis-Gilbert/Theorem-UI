import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

test('normalization preserves rendered failures and missing evidence and is idempotent', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'theorem-oracle-report-'))
  try {
    const reportPath = resolve(directory, 'report-adversarial.json')
    const report = {
      environment: { viewport: { width: 320, height: 720 } },
      corpus: { sha256: 'fixture', valid: true }, coverage: {},
      results: [
        { id: 'COL-01', result: 'fail', observed: { renderedPairs: [{ status: 'fail', ratio: 2 }] } },
        { id: 'COL-01.minimum', result: 'fail', observed: { missingRoles: ['placeholder'] } },
        { id: 'COL-01.product-minimum', result: 'not-measurable', observed: { missingRoles: ['selected'] } },
        { id: 'COL-04', result: 'pass', observed: {} },
      ],
    }
    await writeFile(reportPath, JSON.stringify(report))
    const normalize = () => spawnSync(process.execPath, ['scripts/design-oracles/normalize-reports.mjs', '--in', directory], { encoding: 'utf8' })
    expect(normalize().status).toBe(0)
    const first = await readFile(reportPath, 'utf8')
    const normalized = JSON.parse(first)
    expect(normalized.results.map(row => row.result)).toEqual(['fail', 'fail', 'not-measurable', 'pass'])
    expect(normalized.results[1].observed.missingRoles).toEqual(['placeholder'])
    expect(normalize().status).toBe(0)
    expect(await readFile(reportPath, 'utf8')).toBe(first)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('aggregate refuses an absent manifest and malformed browser evidence', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'theorem-oracle-aggregate-'))
  try {
    await writeFile(resolve(directory, 'report-broken.json'), '{')
    const output = resolve(directory, 'matrix-summary.json')
    const run = spawnSync(process.execPath, ['scripts/design-oracles/aggregate.mjs', '--in', directory, '--out', output], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    const summary = JSON.parse(await readFile(output, 'utf8'))
    expect(summary.manifestError).toBeTruthy()
    expect(summary.malformedReports).toHaveLength(1)
    expect(summary.tally.pass).toBe(0)
    await rm(resolve(directory, 'report-broken.json'))
    await writeFile(resolve(directory, 'matrix-manifest.json'), JSON.stringify({ plannedRuns: [{ report: 'report-required.json', fixtureId: 'F01', engine: 'chromium', preset: 'calm', mode: 'light', viewport: '1440x900' }] }))
    const missingRun = spawnSync(process.execPath, ['scripts/design-oracles/aggregate.mjs', '--in', directory, '--out', output], { encoding: 'utf8' })
    expect(missingRun.status).toBe(1)
    const missingSummary = JSON.parse(await readFile(output, 'utf8'))
    expect(missingSummary.manifestError).toBeNull()
    expect(missingSummary.missingExpectedReports.map(row => row.report)).toEqual(['report-required.json'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})


test('spacing combines declared groups but never masks a token contract failure', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'theorem-oracle-spacing-'))
  try {
    const roles = ['within-controls', 'related-controls', 'group-gap']
    const fixtures = ['F01', 'F05', 'F08']
    const reports = fixtures.map((fixture, index) => ({
      file: `report-${fixture}.json`,
      data: {
        policy: {},
        environment: { browser: 'chromium 156', viewport: { width: 1440, height: 900 }, requestedState: { preset: 'calm', mode: 'light' } },
        observations: { fixtureRoots: [fixture] },
        results: [
          { id: 'SPC-01', result: 'not-measurable', observed: { density: 'comfortable', observed: [{ role: roles[index], measured: [4, 8, 16][index] }] } },
          { id: 'SPC-01.token-consumption', result: 'pass' },
          { id: 'SPC-01.group-hierarchy', result: 'not-measurable' },
        ],
      },
    }))
    await writeFile(resolve(directory, 'matrix-manifest.json'), JSON.stringify({ plannedRuns: reports.map((row, index) => ({ report: row.file, fixtureId: fixtures[index], engine: 'chromium', preset: 'calm', mode: 'light', viewport: '1440x900' })) }))
    for (const row of reports) await writeFile(resolve(directory, row.file), JSON.stringify(row.data))
    const output = resolve(directory, 'matrix-summary.json')
    const aggregate = async () => {
      spawnSync(process.execPath, ['scripts/design-oracles/aggregate.mjs', '--in', directory, '--out', output])
      const summary = JSON.parse(await readFile(output, 'utf8'))
      return summary.oracles.find(row => row.id === 'SPC-01').result
    }
    expect(await aggregate()).toBe('pass')
    reports[0].data.results[1].result = 'fail'
    await writeFile(resolve(directory, reports[0].file), JSON.stringify(reports[0].data))
    expect(await aggregate()).toBe('fail')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
