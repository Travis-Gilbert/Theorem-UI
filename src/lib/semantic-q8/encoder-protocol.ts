export type Q8Identity = {
  model_id: string
  checkpoint_digest: string
  semantic_space_id: string
  producer_revision: string
}

export type Q8Input =
  | { input_kind: 'text'; task: 'search_query'; text: string }
  | { input_kind: 'text'; task: 'document'; title: string | null; text: string }

export type Q8Request =
  | { type: 'encode'; id: number; input: Q8Input }
  | { type: 'cancel'; id: number }

export type Q8Reply =
  | { type: 'ready'; identity: Q8Identity }
  | { type: 'encoded'; id: number; vector: Float32Array }
  | { type: 'refused'; id: number; code: string }
  | { type: 'unavailable'; code: string }

export type Q8Embedding = { identity: Q8Identity; vector: Float32Array }
