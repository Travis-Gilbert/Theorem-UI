import { chooseOption } from './browser-controls.mjs'
// Real browser, shell, editor, attachment adapter, Theorem runtime and SDK.
// Only selected responses of the existing story transport are controlled.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const origin = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const out =
  process.env.ORACLE_RUNTIME_OUT ??
  'docs/plans/composable-appearance/evidence/review/runtime.json'
const codeFamily =
  process.env.ORACLE_RUNTIME_CODE_FAMILY ??
  (process.platform === 'darwin' ? 'Menlo' : 'JetBrains Mono Variable')
await mkdir(dirname(out), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})
page.setDefaultTimeout(12_000)
const checks = []
const pageErrors = []
const threadId = 'thread-app-gallery'
const runId = 'run-appearance-stream'
const translatedTitle =
  'Donaudampfschifffahrtsgesellschaftskapitän und die ausführliche Entscheidungsvorbereitung für den nächsten Forschungsbericht'
const check = (name, passed, observed) => {
  checks.push({ name, passed: Boolean(passed), observed })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}
page.on('pageerror', (error) => pageErrors.push(error.message))
await page.addInitScript(
  ({ threadId }) =>
    localStorage.setItem(
      'theorem-seen-threads',
      JSON.stringify({
        version: 1,
        state: {
          at: {
            [threadId]: Date.now() - 24 * 3600_000,
            'thread-python-sdk': Date.now() - 3600_000,
          },
        },
      }),
    ),
  { threadId },
)

async function installTransport() {
  await page.evaluate(
    ({ threadId, runId, translatedTitle }) => {
      const fetchStory = window.fetch
      const base = '/api/chat/v1'
      const threadPath = `${base}/threads/${threadId}`
      const encoder = new TextEncoder()
      const calls = []
      let revision = 1
      let active = false
      let finishUpload
      let liveController
      let original = []
      let failedUpload = false
      const emitted = []
      const makeEvent = (type, payload) => ({
        runId,
        seq: emitted.length + 1,
        sourceEventType: type,
        payload,
      })
      const bytes = (event) =>
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      const emit = (event) => {
        emitted.push(event)
        liveController?.enqueue(bytes(event))
      }
      const part = (text) =>
        makeEvent('CHAT.MESSAGE.PART', {
          part: { partId: 'appearance-answer', type: 'text', text },
        })
      const complete = (type) => {
        active = false
        emit(makeEvent(type, {}))
        liveController?.close()
        liveController = undefined
      }
      window.__appearanceRuntime = {
        snapshot: () => ({ calls, active, emitted, failedUpload }),
        nextChunk: () =>
          emit(
            part(
              'The first chunk remains. A second chunk arrived after the appearance changed.',
            ),
          ),
        rejectUpload: () => finishUpload?.(),
      }
      window.fetch = async (input, init) => {
        const request = new Request(input, init)
        const path = new URL(request.url).pathname
        if (
          path === `${base}/threads/thread-python-sdk` &&
          request.method === 'GET'
        )
          calls.push({ type: 'read-nav' })
        if (path === `${base}/organization` && request.method === 'GET') {
          const response = await fetchStory(request)
          const organization = await response.json()
          return Response.json({
            ...organization,
            threads: organization.threads.map((thread) =>
              thread.threadId === 'thread-python-sdk'
                ? { ...thread, title: translatedTitle }
                : thread,
            ),
          })
        }
        if (
          path === `${base}/threads/thread-python-sdk` &&
          request.method === 'GET'
        ) {
          const response = await fetchStory(request)
          const snapshot = await response.json()
          return Response.json({
            ...snapshot,
            messages: [
              {
                messageId: 'unread-sdk-reply',
                role: 'assistant',
                createdAtMs: Date.now() - 300_000,
                parts: [],
              },
            ],
          })
        }
        if (path === threadPath && request.method === 'GET') {
          const response = await fetchStory(request)
          const snapshot = await response.json()
          original = snapshot.messages
          return Response.json({
            ...snapshot,
            thread: {
              ...snapshot.thread,
              revision,
              ...(active && { activeRunId: runId }),
            },
            messages: original,
            ...(active && { liveRun: { runId } }),
          })
        }
        if (
          path === `${base}/projects/project-theorem/uploads` &&
          request.method === 'POST'
        ) {
          const content = new Uint8Array(await request.arrayBuffer())
          calls.push({
            type: 'upload',
            bytes: content.byteLength,
            sha256: request.headers.get('x-content-sha256'),
          })
          if (failedUpload)
            return Response.json({
              record: { uploadId: 'appearance-upload', state: 'ready' },
            })
          await new Promise((resolve) => {
            finishUpload = resolve
          })
          failedUpload = true
          return Response.json(
            {
              title: 'File rejected by the fixture intake',
              code: 'unsupported_file',
            },
            { status: 400 },
          )
        }
        if (path === `${threadPath}/messages` && request.method === 'POST') {
          const body = await request.json()
          calls.push({
            type: 'send',
            text: body.text,
            uploads: body.uploadIds,
            key: request.headers.get('idempotency-key'),
          })
          active = true
          revision += 1
          emit(part('The first chunk remains.'))
          return Response.json(
            { record: { messageId: 'appearance-user' }, run: { runId } },
            { status: 201 },
          )
        }
        if (
          path === `${base}/runs/${runId}/events` &&
          request.method === 'GET'
        ) {
          calls.push({ type: 'subscribe', runId })
          return new Response(
            new ReadableStream({
              start(controller) {
                for (const event of emitted) controller.enqueue(bytes(event))
                if (active && !request.signal.aborted) {
                  liveController = controller
                  // A real fetch rejects its body when the caller aborts. The
                  // controlled transport must model that behavior for SDK cancel.
                  request.signal.addEventListener(
                    'abort',
                    () => {
                      if (liveController === controller) {
                        liveController = undefined
                        controller.error(request.signal.reason)
                      }
                    },
                    { once: true },
                  )
                } else controller.close()
              },
              cancel() {
                liveController = undefined
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          )
        }
        if (
          path === `/v1/theorem/agent/stream/${runId}/commands` &&
          request.method === 'POST'
        ) {
          const body = await request.json()
          const key = request.headers.get('idempotency-key')
          calls.push({
            type: 'input',
            runId,
            command: body.command,
            text: body.text,
            key,
          })
          const event = makeEvent('CHAT.MESSAGE.PART', {
            part: {
              partId: 'appearance-input',
              type: 'user_input',
              inputId: 'appearance-input',
              text: body.text,
              status: 'queued',
            },
          })
          return Response.json({
            ...event,
            idempotencyKey: `chat-command:${key}`,
          })
        }
        if (
          path === `${base}/runs/${runId}/cancel` &&
          request.method === 'POST'
        ) {
          calls.push({ type: 'cancel', runId })
          complete('RUN.CANCELLED')
          return Response.json({})
        }
        return fetchStory(request)
      }
    },
    { threadId, runId, translatedTitle },
  )
}

const input = page
  .getByRole('textbox', { name: 'Message input', exact: true })
  .filter({ visible: true })
  .first()
const control = (name) =>
  page
    .getByRole('button', { name, exact: true })
    .filter({ visible: true })
    .first()
const inspect = () => page.evaluate(() => window.__appearanceRuntime.snapshot())
const appearance = (patch) =>
  page.evaluate(async (patch) => {
    const { useAppearance } = await import('/src/lib/appearance.ts')
    useAppearance.getState().setOverrides(patch)
    await document.fonts.ready
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  }, patch)
const assertDomIdentity = () =>
  input.evaluate((editor) => ({
    editor: editor === window.__appearanceEditor,
    draft: editor.textContent,
    selection: window.getSelection()?.toString() ?? '',
  }))
const attach = async () => {
  const chooser = page.waitForEvent('filechooser')
  await control('Add Attachment').click()
  await (
    await chooser
  ).setFiles({
    name: 'fixture-reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('reference fixture\n'),
  })
  await page.locator('.aui-composer-attachments .aui-attachment-tile').waitFor()
}

try {
  await page.goto(`${origin}/story/shell-compare`)
  await page
    .locator('[data-story-ready]')
    .waitFor({ state: 'attached', timeout: 60_000 })
  await installTransport()
  await page.evaluate(async () => {
    await window.__TSR_ROUTER__.options.context.queryClient.invalidateQueries({
      queryKey: ['theorem', 'thread-tree', 'thread-python-sdk'],
    })
  })
  await input.waitFor()
  await page.getByText('New since you were here', { exact: true }).waitFor()
  check(
    'F08 unread transcript divider reflects the saved visit',
    true,
    await page
      .getByText('New since you were here', { exact: true })
      .textContent(),
  )
  const longRow = page
    .getByRole('link', { name: new RegExp(translatedTitle) })
    .filter({ visible: true })
    .first()
  await longRow.waitFor()
  const neverVisited = page
    .getByRole('link', { name: /^PR learning loop/ })
    .filter({ visible: true })
    .first()
  await neverVisited.waitFor()
  check(
    'F08 a thread never previously visited has no unread marker',
    (await neverVisited.getAttribute('data-unread')) === null,
    await neverVisited.textContent(),
  )
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll('[data-unread]')].some((el) =>
        el.textContent.includes(title),
      ),
    translatedTitle,
  )
  check(
    'F08 a newer assistant reply gives a non-color unread row cue',
    (await longRow.textContent()).includes('unread reply'),
    await longRow.textContent(),
  )
  const row = await longRow.evaluate((element) => ({
    name: element.textContent,
    title: element.title,
    width: element.getBoundingClientRect().width,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  check(
    'F08 long translated running row retains name and disclosure without widening its panel',
    row.name.includes(translatedTitle) &&
      row.name.includes('running') &&
      row.title === translatedTitle &&
      row.scrollWidth <= row.clientWidth + 1,
    row,
  )

  await input.fill('Draft with a file and source')
  await attach()
  await page.evaluate(async () => {
    const { useComposerReferences } =
      await import('/src/components/chat/composer-references.tsx')
    useComposerReferences.getState().add({
      label: 'Source note',
      location: { resource: { kind: 'file', path: 'notes/source.md' } },
    })
  })
  const reference = page.getByRole('button', {
    name: 'Remove Source note',
    exact: true,
  })
  const tile = page
    .locator('.aui-composer-attachments .aui-attachment-tile')
    .first()
  await reference.waitFor()
  await tile.evaluate((element) => {
    window.__appearanceAttachment = element
  })
  await reference.evaluate((element) => {
    window.__appearanceReference = element
  })
  await input.focus()
  await input.press('End')
  await input.press('Shift+ArrowLeft')
  await input.evaluate((editor) => {
    window.__appearanceEditor = editor
  })
  const before = await assertDomIdentity()
  const dialog = page.getByRole('dialog', { name: 'Appearance settings' })
  await control('Appearance').click()
  await chooseOption(page, dialog, 'Composer material', 'Frosted glass')
  await dialog
    .getByRole('button', { name: 'Tools above editor', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await input.focus()
  const after = await assertDomIdentity()
  const sameTile = await tile.evaluate(
    (element) => element === window.__appearanceAttachment,
  )
  const sameReference = await reference.evaluate(
    (element) => element === window.__appearanceReference,
  )
  check(
    'F05/F11 real Appearance controls preserve the editor, draft, attachment and reference nodes',
    after.editor &&
      after.draft === before.draft &&
      before.selection.length > 0 &&
      after.selection === before.selection &&
      sameTile &&
      sameReference,
    { before, after, sameTile, sameReference },
  )

  await reference.click()
  await control('Send message').click()
  const uploading = page.getByLabel(/fixture-reference\.txt, uploading/)
  await uploading.waitFor()
  await uploading.evaluate((element) => {
    window.__appearanceUpload = element
  })
  await appearance({ materials: { composer: 'paper' }, layout: 'conversation' })
  const upload = await uploading.evaluate((element) => ({
    sameNode: element === window.__appearanceUpload,
    label: element.getAttribute('aria-label'),
  }))
  check(
    'F07 the in-flight upload node remains visible while changing appearance',
    upload.sameNode && upload.label.endsWith(', uploading'),
    { upload, runtime: await inspect() },
  )
  await page.evaluate(() => window.__appearanceRuntime.rejectUpload())
  const errorTile = page.getByLabel(/fixture-reference\.txt, upload failed/)
  await errorTile.waitFor()
  await errorTile.hover({ position: { x: 8, y: 40 } })
  await page.locator('.aui-attachment-error-message').waitFor()
  const error = await page
    .locator('.aui-attachment-error-message')
    .textContent()
  check(
    'F07 failed upload returns attachment, draft and readable help before any turn dispatch',
    error.length > 0 &&
      (await assertDomIdentity()).draft === before.draft &&
      !(await inspect()).calls.some((call) => call.type === 'send'),
    { error, runtime: await inspect() },
  )
  await control('Send message').click()
  await page.getByText('The first chunk remains.', { exact: true }).waitFor()
  const first = await inspect()
  const attempts = first.calls.filter((call) => call.type === 'upload')
  const sends = first.calls.filter((call) => call.type === 'send')
  check(
    'F07 explicit retry uploads the same bytes and dispatches one recovered turn',
    attempts.length === 2 &&
      attempts.every(
        (attempt) => attempt.sha256 && attempt.sha256 === attempts[0].sha256,
      ) &&
      sends.length === 1 &&
      sends[0].text === before.draft &&
      sends[0].uploads?.includes('appearance-upload'),
    first,
  )
  await input.fill('Use the short version')
  await appearance({
    palette: 'stone',
    materials: { composer: 'liquid' },
    layout: 'sidecar',
  })
  await page.evaluate(() => window.__appearanceRuntime.nextChunk())
  await page
    .getByText(
      'The first chunk remains. A second chunk arrived after the appearance changed.',
      { exact: true },
    )
    .waitFor()
  const second = await inspect()
  check(
    'F06/F11 the same run streams a later chunk through an appearance change',
    first.active &&
      second.active &&
      first.emitted.length === 1 &&
      second.emitted.length === 2 &&
      second.emitted.every((event) => event.runId === runId) &&
      second.calls.filter((call) => call.type === 'send').length === 1 &&
      second.calls.filter(
        (call) => call.type === 'subscribe' && call.runId === runId,
      ).length === 1 &&
      (await assertDomIdentity()).draft === 'Use the short version',
    { first, second },
  )
  await page.evaluate(async () => {
    const { useComposerReferences } =
      await import('/src/components/chat/composer-references.tsx')
    useComposerReferences.getState().add({
      label: 'Source note',
      location: { resource: { kind: 'file', path: 'notes/source.md' } },
    })
  })
  await control('Send to current response').click()
  await page
    .getByText('This response can take text only.', { exact: false })
    .waitFor()
  check(
    'F07 busy text-only validation preserves the draft and reference',
    (await assertDomIdentity()).draft === 'Use the short version' &&
      (await reference.isVisible()) &&
      !(await inspect()).calls.some((call) => call.type === 'input'),
    await inspect(),
  )
  await reference.click()
  await control('Send to current response').click()
  await page.getByText('Queued for the next step', { exact: true }).waitFor()
  const queued = await inspect()
  check(
    'F06 follow-up sends one inbox command with stable run identity',
    queued.active &&
      queued.calls.filter((call) => call.type === 'input').length === 1 &&
      queued.calls.some(
        (call) =>
          call.type === 'input' &&
          call.runId === runId &&
          call.command === 'input' &&
          call.text === 'Use the short version' &&
          call.key,
      ),
    queued,
  )
  await control('Stop generating').click()
  await page.waitForFunction(() =>
    window.__appearanceRuntime
      .snapshot()
      .calls.some((call) => call.type === 'cancel'),
  )
  await control('Stop generating').waitFor({ state: 'hidden' })
  const done = await inspect()
  check(
    'F06 stop sends one separate cancel command for the same run',
    done.calls.filter((call) => call.type === 'cancel').length === 1 &&
      done.calls.filter((call) => call.type === 'input').length === 1 &&
      done.calls.filter((call) => call.type === 'send').length === 1 &&
      !done.active,
    done,
  )
  await page.evaluate(async () => {
    const { useSeenThreads } = await import('/src/lib/theorem/seen-threads.ts')
    // Record the same saved visit the real conversation viewport writes on leave.
    useSeenThreads.getState().mark('thread-python-sdk', Date.now())
  })
  await page.waitForFunction(
    () =>
      !document.querySelector('a[href="/c/thread-python-sdk"][data-unread]'),
  )
  check(
    'F08 recording a newer visit clears the unread row cue',
    (await longRow.getAttribute('data-unread')) === null,
    await longRow.textContent(),
  )

  await page.addInitScript(
    (codeFamily) =>
      localStorage.setItem(
        'theorem-ui:appearance',
        JSON.stringify({
          version: 1,
          state: {
            preset: 'calm',
            overrides: {
              scales: { code: 1.5 },
              font: {
                textFamily: 'IBM Plex Sans Variable',
                codeFamily,
                comfortableMeasure: 35.75,
                wideMeasure: 44.75,
              },
            },
          },
        }),
      ),
    codeFamily,
  )
  await page.goto(`${origin}/story/design-oracle-draft`)
  await page.locator('.theorem-composer .cm-content').first().waitFor()
  const code = await page.evaluate(async () => {
    await document.fonts.ready
    return Object.fromEntries(
      ['.ProseMirror p', '.ProseMirror p code', '.cm-content', '.cm-line'].map(
        (selector) => {
          const node = document.querySelector(selector)
          const style = getComputedStyle(node)
          return [
            selector,
            {
              font: style.fontFamily,
              size: style.fontSize,
              lineHeight: style.lineHeight,
              recipe: node.dataset.appearanceRecipe,
            },
          ]
        },
      ),
    )
  })
  check(
    'TYP-03 composer inline and fenced code honor the custom code family and independent scale',
    code['.ProseMirror p'].size === '16px' &&
      code['.ProseMirror p'].lineHeight === '24px' &&
      code['.cm-content'].recipe === 'code' &&
      ['.ProseMirror p code', '.cm-content', '.cm-line'].every(
        (selector) =>
          code[selector].font
            .split(',')[0]
            .trim()
            .replace(/^['"]|['"]$/g, '') === codeFamily &&
          code[selector].size === '19.5px' &&
          code[selector].lineHeight === '30px',
      ),
    { expectedCodeFamily: codeFamily, styles: code },
  )
  check('No uncaught browser errors', pageErrors.length === 0, pageErrors)
} catch (error) {
  check('Runtime evidence sequence completed', false, {
    error: String(error.stack),
    transport: await inspect().catch(() => null),
  })
} finally {
  await writeFile(
    out,
    JSON.stringify(
      {
        browser: browser.version(),
        environment:
          'local Vite story with deterministic SDK HTTP and asynchronous SSE responses',
        fixtures: ['/story/shell-compare', '/story/design-oracle-draft'],
        viewport: [1440, 900],
        checks,
        pageErrors,
      },
      null,
      2,
    ) + '\n',
  )
  await browser.close()
}
if (checks.some((item) => !item.passed)) process.exitCode = 1
