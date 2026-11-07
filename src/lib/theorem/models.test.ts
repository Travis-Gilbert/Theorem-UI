import { describe, expect, test } from 'bun:test'
import {
  defaultModelDescription,
  modelCatalogIssue,
  formatContext,
  formatPrice,
  parseModelEntry,
  parseModelList,
  resolvedModel,
} from './models'

describe('resolvedModel', () => {
  test('splits the provider off a catalog reference', () => {
    expect(resolvedModel('openrouter/anthropic/claude-sonnet-4.5')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
    })
  })
})

describe('parseModelEntry', () => {
  test('reads an OpenRouter-shaped entry into a picker option', () => {
    expect(
      parseModelEntry({
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Anthropic: Claude Sonnet 4.5',
        description: 'Fast and capable.',
        context_length: 200000,
        pricing: { prompt: '0.000003', completion: '0.000015' },
      }),
    ).toEqual({
      ref: 'openrouter/anthropic/claude-sonnet-4.5',
      name: 'Claude Sonnet 4.5',
      vendor: 'anthropic',
      description: 'Fast and capable.',
      contextLength: 200000,
      promptPrice: 3,
      completionPrice: 15,
      source: 'openrouter',
      inputs: [],
      tools: false,
      reasoning: false,
    })
  })

  test('reads the fields the settings table shows', () => {
    const option = parseModelEntry({
      ref: 'openrouter/google/gemini-2.5-pro',
      id: 'google/gemini-2.5-pro',
      name: 'Google: Gemini 2.5 Pro',
      created: 1750000000,
      architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: ['text'] },
      top_provider: { context_length: 1048576, max_completion_tokens: 65536 },
      supported_parameters: ['tools', 'reasoning', 'temperature'],
      expiration_date: '2026-12-01',
      source: 'openrouter',
    })
    expect(option).toMatchObject({
      inputs: ['text', 'image', 'file'],
      tools: true,
      reasoning: true,
      maxOutput: 65536,
      addedAtMs: 1750000000000,
      expiresOn: '2026-12-01',
      source: 'openrouter',
    })
  })

  test('a catalog row is marked as Theorem catalog', () => {
    expect(
      parseModelEntry({ ref: 'anthropic/claude-opus-4-1', name: 'Claude Opus 4.1', source: 'catalog' })
        ?.source,
    ).toBe('catalog')
  })

  test('keeps a ref that already names its provider', () => {
    expect(
      parseModelEntry({ ref: 'openrouter/thinkingmachines/inkling', name: 'Inkling' })
        ?.ref,
    ).toBe('openrouter/thinkingmachines/inkling')
  })

  test('drops an entry without an id', () => {
    expect(parseModelEntry({ name: 'nameless' })).toBeUndefined()
    expect(parseModelEntry('nonsense')).toBeUndefined()
  })
})

describe('parseModelList', () => {
  test('preserves a safe typed default failure without exposing extra fields', () => {
    const failure = { code: 'chat_model_not_found', message: 'Choose a model or correct the configured default.', credential: 'private' }
    expect(parseModelList({ models: [], defaultError: failure })).toMatchObject({
      defaultError: { code: failure.code, message: failure.message },
    })
    expect(parseModelList({ defaultError: { code: 3, message: 'invalid' } })).not.toHaveProperty('defaultError')
  })

  test('reads the route body, keeping the default and the OpenRouter status', () => {
    expect(
      parseModelList({
        defaultRef: 'openrouter/thinkingmachines/inkling',
        models: [{ id: 'a/b', name: 'B' }, { name: 'no id' }],
        openrouter: { status: 'cached', fetchedAtMs: 5 },
      }),
    ).toEqual({
      defaultRef: 'openrouter/thinkingmachines/inkling',
      models: [expect.objectContaining({ ref: 'openrouter/a/b' })],
      openrouter: 'cached',
    })
  })

  test('a body without models is an empty list Theorem could not fill', () => {
    expect(parseModelList({})).toEqual({ models: [], openrouter: 'unavailable' })
  })
})

describe('formatting', () => {
  test('context in thousands or millions of tokens', () => {
    expect(formatContext(200000)).toBe('200K')
    expect(formatContext(1048576)).toBe('1M')
    expect(formatContext(32768)).toBe('33K')
  })

  test('price per million tokens, in and out', () => {
    expect(formatPrice({ promptPrice: 3, completionPrice: 15 })).toBe('$3 / $15 per M')
    expect(formatPrice({ promptPrice: 0, completionPrice: 0 })).toBe('Free')
    expect(formatPrice({ promptPrice: 0.075, completionPrice: 0.3 })).toBe('$0.075 / $0.30 per M')
    expect(formatPrice({})).toBeUndefined()
  })
})


test('model default descriptions retain an unknown catalog ref and no issue is invented', () => {
  expect(defaultModelDescription([], 'provider/actual')).toBe('provider/actual')
  expect(modelCatalogIssue(undefined, undefined)).toBeUndefined()
  expect(modelCatalogIssue(parseModelList({}), null)).toBeUndefined()
  expect(parseModelList({ defaultError: { code: 'bad', message: 42 } })).not.toHaveProperty('defaultError')
  expect(parseModelList({ defaultError: null })).not.toHaveProperty('defaultError')
})


test('default identity selects the matching row rather than the first catalog model', () => {
  const list = parseModelList({ models: [{ ref: 'provider/other', name: 'Other' }, { ref: 'provider/actual', name: 'Actual' }], openrouter: { status: 'live' } })
  expect(defaultModelDescription(list.models, 'provider/actual')).toBe('Actual (provider/actual)')
  expect(list.openrouter).toBe('live')
  expect(parseModelList(null)).toEqual({ models: [], openrouter: 'unavailable' })
  expect(parseModelList({ defaultRef: 42 })).not.toHaveProperty('defaultRef')
})

test('an unavailable OpenRouter directory explains why only configured models remain', () => {
  const list = parseModelList({
    models: [{ ref: 'openrouter/fixture/configured', name: 'Configured' }],
    openrouter: { status: 'unavailable', error: 'network_error' },
  })
  expect(modelCatalogIssue(list, undefined)).toContain('OpenRouter')
  expect(modelCatalogIssue(list, undefined)).toContain('configured models')
})
