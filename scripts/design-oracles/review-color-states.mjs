import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { blend, converter, parse, wcagContrast } from 'culori'
import { chromium, firefox, webkit } from 'playwright-core'
import {
  engines,
  modes,
  stateChecks,
  validateColorStateEvidence,
} from './color-states.mjs'

const drivers = { chromium, firefox, webkit }
const origin = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const out =
  process.env.ORACLE_COLOR_STATES_OUT ??
  'docs/plans/composable-appearance/evidence/review/color-states.json'
const viewport = { width: 1440, height: 900 }
const cases = []
const rgb = converter('rgb')
const solid = (paint) => {
  const color = rgb(paint)
  return color && (color.alpha ?? 1) === 1
}

async function load(page, route) {
  await page.goto(`${origin}/story/${route}`)
  await page.locator('[data-story-ready]').waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.ready)
}

async function readState(target, { name, state, descendant, icon = false }) {
  const kind = stateChecks[name]
  const observed = await target.evaluate(
    (node, { state, descendant, icon }) => {
      const content = descendant ? node.querySelector(descendant) : node
      const nodeStyle = getComputedStyle(node)
      const contentStyle = content && getComputedStyle(content)
      const stateObserved = {
        default: !node.matches(':hover,:active,:focus-visible,:disabled'),
        hover: node.matches(':hover') && !node.matches(':active'),
        pressed: node.matches(':active'),
        focused: node.matches(':focus-visible'),
        inactive: node.matches(':disabled,[aria-disabled="true"]'),
        selected: node.matches('[aria-current="true"]'),
        highlighted:
          node.matches('[data-highlighted]') &&
          !!node.closest('[data-slot="combobox-popup"]'),
        error: node.matches('[role="alert"]'),
        loading:
          node.matches('[data-slot="thinking-label"]') &&
          !!content?.textContent?.trim(),
      }[state]
      const layers = []
      const unsupported = []
      for (
        let layer = icon ? node : content;
        layer;
        layer = layer.parentElement
      ) {
        const style = getComputedStyle(layer)
        layers.push({
          tag: layer.tagName,
          background: style.backgroundColor,
          image: style.backgroundImage,
          opacity: Number(style.opacity),
          mask: style.maskImage,
          filter: style.filter,
          backdrop: style.backdropFilter,
          transition: style.transitionProperty,
        })
        if (
          style.maskImage !== 'none' ||
          style.filter !== 'none' ||
          Number(style.opacity) !== 1
        )
          unsupported.push(layer.tagName)
      }
      return {
        stateObserved,
        foreground: contentStyle
          ? icon
            ? content.matches('path')
              ? contentStyle.fill
              : contentStyle.backgroundColor
            : contentStyle.color
          : null,
        layers,
        unsupported,
        visible: Boolean(
          content?.getClientRects().length &&
          contentStyle?.visibility === 'visible',
        ),
        text: icon
          ? node.getAttribute('aria-label')
          : content?.textContent?.trim(),
        foregroundRole: node.getAttribute('data-foreground-role'),
        backgroundRole: node.getAttribute('data-background-role'),
        backgroundToken: nodeStyle.backgroundColor,
        controlColor: nodeStyle.color,
        controlTransition: nodeStyle.transitionProperty,
        iconColor: icon ? contentStyle?.color : null,
        iconOpacity: icon && contentStyle ? Number(contentStyle.opacity) : null,
      }
    },
    { state, descendant, icon },
  )
  const result = { name, kind, ...observed }
  const unavailable = (reason) => ({
    ...result,
    status: 'not-measurable',
    reason,
  })
  if (!observed.stateObserved)
    return unavailable('Browser did not enter the required state')
  if (kind === 'inactive-control')
    return {
      ...result,
      status: 'not-applicable',
      reason: 'Native disabled control has no available action',
    }
  if (!observed.foreground || !observed.visible || !observed.text)
    return unavailable('Text or icon paint is absent or hidden')
  if (icon && observed.iconOpacity !== 1)
    return unavailable('Icon has unresolved opacity')
  if (observed.unsupported.length)
    return unavailable('Ancestor paint effect requires a separate proof')
  const paints = []
  let opaque = false
  for (const layer of observed.layers) {
    if (layer.image !== 'none')
      return unavailable('Background image requires a bounded paint proof')
    if (layer.backdrop !== 'none' && !solid(layer.background))
      return unavailable('Translucent backdrop filter has no proven bound')
    if (!parse(layer.background))
      return unavailable('Background is not valid CSS color paint')
    paints.unshift(layer.background)
    if (solid(layer.background)) {
      opaque = true
      break
    }
  }
  if (!opaque) return unavailable('No opaque background was resolved')
  const background = blend(paints, 'normal', 'rgb')
  const foreground = blend([background, observed.foreground], 'normal', 'rgb')
  const ratio = wcagContrast(foreground, background)
  const minimum = kind === 'text' ? 4.5 : 3
  return {
    ...result,
    ratio,
    minimum,
    resolvedForeground: foreground,
    resolvedBackground: background,
    status: ratio >= minimum ? 'pass' : 'fail',
  }
}

async function settleButtonPaint(button) {
  await button.evaluate(async (node) => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
    const animations = node
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations === 1)
    await Promise.allSettled(animations.map((animation) => animation.finished))
  })
}

async function buttonStates(page, button, prefix, icon, includeFocus) {
  const rows = []
  await page.mouse.move(1, 1)
  const state = (state) =>
    readState(button, {
      name: `${prefix}/${state}`,
      state,
      descendant: icon,
      icon: true,
    })
  const interactive = async (name) => {
    const immediate = await state(name)
    await settleButtonPaint(button)
    const settled = await state(name)
    const least =
      [immediate, settled].find((sample) => sample.status === 'fail') ??
      [immediate, settled].find((sample) => sample.status !== 'pass') ??
      (immediate.ratio <= settled.ratio ? immediate : settled)
    return { ...least, samples: { immediate, settled } }
  }
  await settleButtonPaint(button)
  rows.push(await state('default'))
  if (includeFocus) {
    // Start from keyboard navigation before pointer interaction. Some engines
    // retain pointer focus on the pressed button instead of cycling back.
    for (let attempt = 0; attempt < 70; attempt++) {
      await page.keyboard.press('Tab')
      if (
        await button.evaluate(
          (node) =>
            node === document.activeElement && node.matches(':focus-visible'),
        )
      )
        break
    }
    await settleButtonPaint(button)
    rows.push(await state('focused'))
    await button.evaluate((node) => node.blur())
  }
  await button.hover()
  rows.push(await interactive('hover'))
  await page.mouse.down()
  try {
    rows.push(await interactive('pressed'))
  } finally {
    await page.mouse.move(1, 1)
    await page.mouse.up()
  }
  return rows
}

for (const engine of engines.filter(
  (name) => !process.env.ORACLE_ENGINE || name === process.env.ORACLE_ENGINE,
)) {
  const browser = await drivers[engine].launch()
  try {
    for (const mode of modes) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        colorScheme: mode,
      })
      const page = await context.newPage()
      page.setDefaultTimeout(35_000)
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript((mode) => {
        localStorage.setItem('theorem-ui-theme', mode)
        localStorage.setItem(
          'theorem-ui:appearance',
          JSON.stringify({
            version: 1,
            state: { preset: 'calm', overrides: {} },
          }),
        )
      }, mode)
      const item = {
        engine,
        version: browser.version(),
        preset: 'calm',
        mode,
        viewport,
        rows: [],
        errors,
      }
      cases.push(item)
      try {
        await load(page, 'design-oracle-draft')
        const send = page.getByRole('button', {
          name: 'Send message',
          exact: true,
        })
        await send.waitFor()
        await page.waitForFunction(
          () => !document.querySelector('.aui-composer-send')?.disabled,
        )
        item.rows.push(
          ...(await buttonStates(
            page,
            send,
            'send',
            '.icon-mask[data-layer="line"]',
            true,
          )),
        )

        await load(page, 'design-oracle-failure')
        const error = page.locator('.aui-message-error-root').first()
        await error.waitFor()
        item.rows.push(
          await readState(error, {
            name: 'message/error',
            state: 'error',
            descendant: '.aui-message-error-message',
          }),
        )
        item.rows.push(
          await readState(page.locator('.aui-composer-send'), {
            name: 'send/inactive',
            state: 'inactive',
          }),
        )

        await load(page, 'design-oracle-stream')
        const label = page.locator('[data-slot="thinking-label"]').first()
        await label.waitFor()
        item.rows.push(
          await readState(label, {
            name: 'activity/loading',
            state: 'loading',
          }),
        )

        const stop = page.getByRole('button', {
          name: 'Stop generating',
          exact: true,
        })
        await stop.waitFor()
        item.rows.push(
          ...(await buttonStates(page, stop, 'stop', 'svg path', false)),
        )

        // The fully wired shell fixture owns the Theorem runtime and model catalog.
        await load(page, 'design-oracle-navigation')
        const nav = page
          .locator(
            '[data-appearance-part="navigation-row"][aria-current="true"]',
          )
          .first()
        await nav.waitFor()
        item.rows.push(
          await readState(nav, {
            name: 'navigation/selected',
            state: 'selected',
            descendant: 'span.truncate',
          }),
        )
        const model = page.locator('[aria-label="Model"]').first()
        await model.click()
        const option = page
          .locator('[data-slot="combobox-item"]')
          .filter({ hasText: 'Default model' })
          .first()
        await option.hover()
        item.rows.push(
          await readState(option, {
            name: 'model-option/highlighted',
            state: 'highlighted',
            descendant: '.truncate',
          }),
        )
        await page.keyboard.press('Escape')
      } catch (error) {
        item.error = String(error)
      } finally {
        await context.close()
      }
      console.log(
        `${engine}/${mode} ${item.rows.map((row) => `${row.name}:${row.status}${row.ratio ? `(${row.ratio.toFixed(2)})` : ''}`).join(' ')}${item.error ? ` ${item.error}` : ''}`,
      )
    }
  } finally {
    await browser.close()
  }
}
const report = {
  scope:
    'Representative rendered interaction and runtime state paints in Calm light and dark',
  cases,
}
const validation = validateColorStateEvidence(report)
await mkdir(dirname(out), { recursive: true })
await writeFile(
  out,
  JSON.stringify(
    {
      ...report,
      status: validation.status,
      missing: validation.missing,
      failed: validation.failed,
    },
    null,
    2,
  ) + '\n',
)
if (process.env.ORACLE_ENGINE) {
  if (
    validation.failed.length ||
    validation.missing.some(
      ({ name, reason }) => name || reason !== 'engine and mode absent',
    )
  )
    process.exitCode = 1
} else if (validation.status !== 'pass') process.exitCode = 1
