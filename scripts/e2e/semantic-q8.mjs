// Runs the actual saved-passage UI, module worker and pinned Q8 model.
// The in-process API fixture below verifies the wire and provides candidates;
// this is not a RedCore, durable-restart or authentication oracle.
import assert from 'node:assert/strict'
import { createReadStream, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import svgr from 'vite-plugin-svgr'
import { servePage } from './harness.mjs'

const dir = process.env.E2E_Q8_ASSETS
if (!dir)
  throw new Error('Set E2E_Q8_ASSETS to the staged /semantic/q8/v1 directory')
const root = resolve(dir)
const mount = '/semantic/q8/v1/'
const types = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
}
const assets = []
const middleware = (server) => {
  server.middlewares.use(mount, (request, response, next) => {
    const path = request.url?.split('?')[0]?.replace(/^\/+/, '')
    if (!path || !/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..'))
      return next()
    const file = resolve(root, path)
    const info = statSync(file, { throwIfNoEntry: false })
    if (!info?.isFile()) return next()
    assets.push(path)
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
    })
    if (request.method === 'HEAD') return response.end()
    createReadStream(file).pipe(response)
  })
}
const served = await servePage('semantic-q8', [
  svgr(),
  {
    name: 'fixture-q8-streaming-assets',
    configureServer: middleware,
    configurePreviewServer: middleware,
  },
])

let browser
try {
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM })
  const context = await browser.newContext()
  const page = await context.newPage()
  const origin = new URL(served.url).origin
  const remote = []
  const errors = []
  const stored = new Map()
  const publications = []
  const texts = {
    ocean: 'The ocean stores most of the heat from global warming.',
    bread: 'Bread dough rises as yeast ferments the flour.',
  }
  let authorized = new Set(Object.keys(texts))
  const identity = {
    checkpointDigest:
      '64247463787b53192f783e1916188f6408154bbbff600b427ac3b01a151bca49',
    semanticSpaceId:
      'semantic-space:60fcd131b15661698a1e5d6b99c1466922d5443682339e4c714b8a86e4cd1066',
    producerRevision:
      'ea2b29a0a8c09e43dc49c2d354e71ac3362f91e507a34689bcaaec1b4841f9e2',
    representationRevision: 'embeddinggemma2-shared-projection/1',
    modalities: 'text-image',
  }
  function checkVector(vector) {
    assert.equal(vector.length, 256)
    assert(vector.every(Number.isFinite))
    assert(Math.abs(Math.hypot(...vector) - 1) < 1e-5)
  }
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(
    (url) => url.origin !== origin,
    (route) => {
      remote.push(new URL(route.request().url()).origin)
      return route.abort()
    },
  )
  const indexPath = '/api/chat/v1/threads/q8-browser/retained-semantic'
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const reply = (json) => route.fulfill({ json })
    if (path === '/api/chat/v1/bootstrap')
      return reply({ csrfToken: 'fixture-csrf' })
    const source = (partId) => ({
      handle: `fixture:${partId}`,
      version: 'v1',
      extractionVersion: 'fixture/1',
      textBasis: 'utf8-extracted-text',
      textBytes: texts[partId].length,
      coverage: { status: 'complete' },
    })
    const span = (partId) => ({ startByte: 0, endByte: texts[partId].length })
    if (path === '/api/chat/v1/threads/q8-browser') {
      assert.equal(route.request().method(), 'GET')
      return reply({
        messages: [
          {
            schema: 'theorem.chat.message.v1',
            messageId: 'research-answer',
            tenantId: 'fixture',
            threadId: 'q8-browser',
            originBranchId: 'main',
            role: 'assistant',
            runId: 'research-run',
            createdAtMs: 1,
            parts: Object.keys(texts).map((partId) => ({
              partId,
              type: 'citation',
              payload: {
                sourceId: partId,
                sourceKind: 'web_read',
                label: partId === 'ocean' ? 'Ocean warming' : 'Bread baking',
                provenance: {
                  excerpt: texts[partId],
                  source: source(partId),
                  span: span(partId),
                },
              },
            })),
          },
        ],
      })
    }
    if (path.includes('/citations/')) {
      const partId = path.split('/').at(-1)
      assert.equal(
        path,
        `/api/chat/v1/threads/q8-browser/messages/research-answer/citations/${partId}`,
      )
      if (!authorized.has(partId)) return route.fulfill({ status: 404 })
      return reply({
        source: source(partId),
        span: span(partId),
        excerpt: texts[partId],
      })
    }
    const value = route.request().postDataJSON()
    if (path === `${indexPath}/prepare`) {
      assert.deepEqual(
        value.citations,
        ['ocean', 'bread'].map((partId) => ({
          messageId: 'research-answer',
          partId,
        })),
      )
      const eligible = value.citations.filter(({ partId }) =>
        authorized.has(partId),
      )
      return reply({
        authorized: eligible.length,
        missing: eligible
          .filter(({ partId }) => !stored.has(partId))
          .map(({ messageId, partId }) => ({
            messageId,
            partId,
            inputDigest: `${partId}:v1`,
            text: texts[partId],
          })),
      })
    }
    if (path === `${indexPath}/publish`) {
      assert.equal(route.request().headers()['x-csrf-token'], 'fixture-csrf')
      assert.match(
        route.request().headers()['idempotency-key'] ?? '',
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
      )
      assert.equal(value.inputDigest, `${value.partId}:v1`)
      assert(!('text' in value))
      assert.deepEqual(value.identity, identity)
      checkVector(value.vector)
      publications.push(value.partId)
      stored.set(value.partId, value.vector)
      return reply({
        status: 'published',
        inputDigest: value.inputDigest,
        semanticSpaceId: identity.semanticSpaceId,
        producerRevision: identity.producerRevision,
      })
    }
    if (path === `${indexPath}/search`) {
      assert(!('text' in value))
      assert.deepEqual(value.identity, identity)
      checkVector(value.queryVector)
      return reply({
        matches: value.citations
          .filter(({ partId }) => stored.has(partId) && authorized.has(partId))
          .map((ref) => ({
            ...ref,
            score: stored
              .get(ref.partId)
              .reduce((sum, x, i) => sum + x * value.queryVector[i], 0),
          }))
          .sort((a, b) => b.score - a.score),
      })
    }
    return route.fulfill({ status: 404 })
  })

  const query = async (
    text = 'Where is the heat from global warming stored?',
  ) => {
    if ((await page.locator('details').getAttribute('open')) === null)
      await page.locator('summary').click()
    const input = page.getByRole('searchbox', { name: 'Search saved passages' })
    await input.fill(text)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
  }
  const panel = page.locator('[data-slot="saved-passage-search"]')
  const matches = () => panel.locator('li')
  const waitForRanked = async (label) => {
    const status = panel.getByText(label, { exact: true })
    const error = panel.getByRole('alert')
    await status.or(error).waitFor({ timeout: 180_000 })
    assert(await status.isVisible(), await error.allTextContents())
  }
  await page.goto(served.url)
  await page.locator('summary').waitFor()
  assert.deepEqual(assets, [])
  assert.deepEqual(publications, [])
  await query()
  await waitForRanked('2 matching passages.')
  assert.match(await matches().first().textContent(), /Ocean warming/)
  assert.deepEqual(publications, ['ocean', 'bread'])
  assert(assets.some((asset) => asset.endsWith('/model_quantized.onnx_data')))
  assert(!assets.some((asset) => /fp32|asyncify/.test(asset)))
  await matches()
    .first()
    .getByRole('button', { name: 'Open the retained passage of Ocean warming' })
    .click()
  await matches().first().getByText(new RegExp(texts.ocean)).waitFor()

  const coldRequests = assets.length
  await query('How does yeast make bread rise?')
  await waitForRanked('2 matching passages.')
  assert.match(await matches().first().textContent(), /Bread baking/)
  assert.equal(assets.length, coldRequests)
  assert.deepEqual(publications, ['ocean', 'bread'])

  await page.reload()
  authorized = new Set(['bread'])
  await query()
  await waitForRanked('1 matching passage.')
  assert.equal(await matches().count(), 1)
  assert.match(await matches().first().textContent(), /Bread baking/)
  assert.deepEqual(publications, ['ocean', 'bread'])
  assert.deepEqual(remote, [])
  assert.deepEqual(errors, [])
  console.log(
    'Browser Q8: query-triggered load, expected top result, no fp32, and no passage re-encoding on reload under the API fixture.',
  )
} finally {
  await browser?.close()
  await served.close()
}
