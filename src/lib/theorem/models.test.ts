import { describe, expect, test } from 'bun:test'
import {
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
      connection: 'openrouter',
      kind: 'language',
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
      parseModelEntry({ ref: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' })
        ?.ref,
    ).toBe('anthropic/claude-sonnet-4-5')
  })

  test('takes the connection Theorem names, else the ref\'s provider', () => {
    expect(parseModelEntry({ ref: 'anthropic/claude-sonnet-4-5' })?.connection).toBe('anthropic')
    expect(
      parseModelEntry({ ref: 'custom:lab/qwen3-coder', connection: 'custom:lab' })?.connection,
    ).toBe('custom:lab')
  })

  test('a decision model is marked by Theorem or by its output modality', () => {
    expect(parseModelEntry({ ref: 'openrouter/typesafe/jev-1.14', kind: 'decision' })?.kind).toBe(
      'decision',
    )
    expect(
      parseModelEntry({
        id: 'typesafe/jev-1.14',
        architecture: { input_modalities: ['text'], output_modalities: ['decisions'] },
      })?.kind,
    ).toBe('decision')
    expect(parseModelEntry({ id: 'a/b' })?.kind).toBe('language')
  })

  test('drops an entry without an id', () => {
    expect(parseModelEntry({ name: 'nameless' })).toBeUndefined()
    expect(parseModelEntry('nonsense')).toBeUndefined()
  })
})

describe('parseModelList', () => {
  test('reads the route body, keeping the default and the OpenRouter status', () => {
    expect(
      parseModelList({
        defaultRef: 'openrouter/deepseek/deepseek-v4.1-flash-1017',
        models: [{ id: 'a/b', name: 'B' }, { name: 'no id' }],
        openrouter: { status: 'cached', fetchedAtMs: 5 },
      }),
    ).toEqual({
      defaultRef: 'openrouter/deepseek/deepseek-v4.1-flash-1017',
      models: [expect.objectContaining({ ref: 'openrouter/a/b' })],
      decisionModels: [],
      openrouter: 'cached',
    })
  })

  test('decision models are kept apart from the ones a turn runs on', () => {
    const list = parseModelList({
      models: [
        { id: 'a/b', name: 'B' },
        { ref: 'openrouter/typesafe/jev-1.14', name: 'JEV 1.14', kind: 'decision' },
      ],
    })
    expect(list.models.map((m) => m.ref)).toEqual(['openrouter/a/b'])
    expect(list.decisionModels.map((m) => m.ref)).toEqual(['openrouter/typesafe/jev-1.14'])
  })

  test('a body without models is an empty list Theorem could not fill', () => {
    expect(parseModelList({})).toEqual({ models: [], decisionModels: [], openrouter: 'unavailable' })
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
