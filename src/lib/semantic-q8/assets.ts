const base = '/semantic/q8/v1/'

/** Immutable, same-origin release paths. Importing this file fetches nothing. */
export const semanticQ8 = {
  version: 'v1',
  producerUrl: `${base}producer/semantic.js`,
  transformersUrl: `${base}transformers/transformers.js`,
  runtimeBase: `${base}runtime/`,
  modelBase: `${base}models/`,
} as const
