// Browser-local EmbeddingGemma 2 producer for the XERJ context stage.
//
// The browser encodes with the pinned Q8 weight export of the same checkpoint
// the native worker loads, with the text model and the vision encoder on and
// audio off. Every model byte is fetched from the page's own origin and checked
// by the browser against the digests below (Subresource Integrity), so a missing
// or altered model refuses instead of running something else. No other model,
// lexical ranking or hash embedding stands in for a refusal.
//
// Vectors stay in the browser. They name their own semantic space (the ONNX
// checkpoint, not the native one), and the node strips caller-supplied
// vectors, so nothing produced here becomes a trusted node result. Retrieval
// runs only over records whose sources the authenticated host granted to this
// session, and the shaped packet comes from the same XERJ function the node
// runs (`admitRecall`).
//
// The module holds no graph, file or network authority of its own. The host
// passes in the transformers.js module and the admitRecall binding.

export const PRODUCER = Object.freeze({
  schema: 'theorem.browser-semantic-producer/1',
  model_id: 'google/embeddinggemma-2',
  base_revision: '914f7f89142e33e77833254d9c9b90c3cef7303b',
  export: 'onnx-community/embeddinggemma-2-ONNX',
  export_revision: 'daa72c51243991dfcaf9f9137d2c573d8f7790c0',
  runtime: Object.freeze({ transformers: '4.3.2', onnxruntime_web: '1.31.0-dev.20260914-8d85527a0' }),
  // Q8 weight quantization for both the text model and the vision encoder, on
  // the delivery requirement that one producer serves text and image.
  // fp16 *compute* remains excluded: it degrades or breaks this model. Q8
  // weights are a different producer from the fp32 weights, and this module
  // does not claim otherwise -- `producerIdentity` derives `checkpoint_digest`
  // from the file table below and folds `dtype` into `producer_revision`, so
  // the Q8 space id and revision differ from the fp32 ones and a cache written
  // by an fp32 producer cannot be read as a Q8 vector. The fp32 browser/native
  // parity evidence is therefore historical for this producer; re-establishing
  // it against the fp32 native oracle is the Q8 lane's job, not this switch's.
  dtype: Object.freeze({ model: 'q8', vision_encoder: 'q8' }),
  modalities: 'text-image',
  space: Object.freeze({ native_dims: 768, dims: 256, normalization: 'l2-after-truncation', metric: 'cosine' }),
  model_files: Object.freeze({
    'config.json': '8d011bfe08b5e345bbe0b81e5c6fd02c381920b345b986047bc2a33ce7b90d1d',
    'preprocessor_config.json': '9344893f8d0573a46ebb2ca54c03f56d044cea194c8dcfb1f4d652240ac21daa',
    'processor_config.json': '168f6a08522f3ce5dea596d94d003af2fd691742d4f41fe1f9d8cce76bfbf69c',
    'tokenizer.json': '4d777ef5bdc1aa36227abdfb77c3e49e7b9c892d16e1b6bda41c393504828be4',
    'tokenizer_config.json': '17bd5d6e9364ca49a534e1502076593317c298d4a663623091ed45388f004874',
    'chat_template.jinja': '4b852efc0b9960283e735363331e6f325b33bc74bdbaa076f595bc4e9b94d85e',
    'onnx/model_quantized.onnx': 'd06edd601f851c633a2519304cbeb8dc6170d7ceb61b436625c17fb9b6e74953',
    'onnx/model_quantized.onnx_data': '278a7ff1248c3618e4bd11a607fc54f7bdc7778854230f3956d3f86bd9db4f3b',
    'onnx/vision_encoder_quantized.onnx': 'bb0de2df53a2448a32dc7908a187c168c8afd514d4d6f674f7f46024875fa4e3',
    'onnx/vision_encoder_quantized.onnx_data': '3dabd69c0a36e9a8771ad82030dde74daa5a0e02b7047a5d3f3382b1137bab89',
  }),
  // The runtime is loaded from these verified bytes, never fetched by ORT itself.
  runtime_files: Object.freeze({
    'ort-wasm-simd-threaded.mjs': 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f',
    'ort-wasm-simd-threaded.wasm': '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3',
    'ort-wasm-simd-threaded.asyncify.mjs': '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611',
    'ort-wasm-simd-threaded.asyncify.wasm': '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
  }),
});

const MODEL_DIR = PRODUCER.export;
const TASKS = Object.freeze({ search_query: 'search result' });
const MESSAGES = Object.freeze({
  initializing: 'Required semantic query encoding is still initializing',
  unavailable: 'Required semantic query encoding is unavailable',
  refused: 'Required semantic query encoding was refused',
});
const UNAVAILABLE = new Set(['model_not_installed', 'checkpoint_mismatch', 'runtime_unavailable', 'runtime_mismatch',
  'semantic_closed', 'semantic_producer_in_use']);
const OWNERS = new WeakMap();
const ENVIRONMENT_OWNERS = new WeakMap();
const CACHE_SCHEMA = 'theorem.browser-semantic-cache/1';
const INDEX_STATES = new WeakMap();
const DEFAULT_INDEX_CAPACITY = 4096;


export class SemanticRefusal extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const status = code => (code === 'semantic_initializing' ? 'initializing' : UNAVAILABLE.has(code) ? 'unavailable' : 'refused');

/** The node's refusal envelope: no results, no fabricated vector. */
export function refusal(code) {
  return {
    error: code,
    message: MESSAGES[status(code)],
    semantic_receipt: { status: status(code), required: true, reason: code },
    completion_state: 'not_started',
  };
}

const utf8 = value => new TextEncoder().encode(value);
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const base64 = digest => btoa(String.fromCharCode(...digest.match(/../g).map(pair => parseInt(pair, 16))));

/** The repository's length-prefixed SHA-256 fingerprint (`semantic_encoding::fingerprint`). */
export async function fingerprint(domain, fields) {
  const parts = [domain, ...fields].map(utf8);
  const buffer = new Uint8Array(parts.reduce((total, part) => total + 8 + part.length, 0));
  const view = new DataView(buffer.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setBigUint64(offset, BigInt(part.length));
    buffer.set(part, offset + 8);
    offset += 8 + part.length;
  }
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

function runtimeFiles(device) {
  // The WebGPU build drops CPU GatherBlockQuantized, used by the Q8 text graph.
  // The plain WASM build from the same package retains that kernel.
  const stem = device === 'wasm' ? 'ort-wasm-simd-threaded' : 'ort-wasm-simd-threaded.asyncify';
  return [`${stem}.mjs`, `${stem}.wasm`];
}

/** Identity of this producer, derived from the admitted files rather than claimed. */
export async function producerIdentity(device = 'wasm') {
  const names = Object.keys(PRODUCER.model_files).sort();
  const checkpoint_digest = await fingerprint('semantic-snapshot/1', names.map(name => `${name}:${PRODUCER.model_files[name]}`));
  const semantic_space_id = 'semantic-space:' + await fingerprint('semantic-space/1', [
    PRODUCER.model_id, checkpoint_digest, 'embeddinggemma2-shared-projection/1', 'theorem.semantic/1',
    '768:first-256', 'l2-after-truncation', 'cosine', '']);
  const producer_revision = await fingerprint('browser-semantic-producer/1', [
    PRODUCER.export, PRODUCER.export_revision, PRODUCER.runtime.transformers, PRODUCER.runtime.onnxruntime_web,
    PRODUCER.dtype.model, PRODUCER.dtype.vision_encoder, PRODUCER.modalities, device,
    ...runtimeFiles(device).map(name => `${name}:${PRODUCER.runtime_files[name]}`)]);
  return { model_id: PRODUCER.model_id, checkpoint_digest, semantic_space_id, producer_revision };
}

/** A fetch that serves only admitted files, each verified by the browser. */
function pinnedFetch(modelBase, runtimeBase, runtimeNames, failures, requested, signal) {
  const model = new URL(`${modelBase}${MODEL_DIR}/`, location.href);
  const runtime = new URL(runtimeBase, location.href);
  const within = (url, base) => url.origin === base.origin && url.pathname.startsWith(base.pathname);
  return async (input, init = {}) => {
    if (signal.aborted) throw new SemanticRefusal('semantic_closed');
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    let digest;
    let codes;
    if (within(url, model)) {
      const name = decodeURIComponent(url.pathname.slice(model.pathname.length));
      digest = PRODUCER.model_files[name];
      requested.push({ name, admitted: Boolean(digest) });
      // A file outside the admitted set does not exist for this producer.
      if (!digest) return new Response(null, { status: 404 });
      codes = ['model_not_installed', 'checkpoint_mismatch'];
    } else if (within(url, runtime)) {
      const name = url.pathname.slice(runtime.pathname.length);
      if (runtimeNames.includes(name)) digest = PRODUCER.runtime_files[name];
      codes = ['runtime_unavailable', 'runtime_mismatch'];
    }
    if (!digest) {
      failures.push('semantic_source_not_admitted');
      throw new SemanticRefusal('semantic_source_not_admitted');
    }
    try {
      const response = await fetch(url, { ...init, signal, integrity: `sha256-${base64(digest)}`, cache: 'no-store' });
      if (signal.aborted) throw new SemanticRefusal('semantic_closed');
      if (response.ok) return response;
    } catch {
      // An integrity mismatch and a missing file both reject; tell them apart.
    }
    if (signal.aborted) throw new SemanticRefusal('semantic_closed');
    const probe = await fetch(url, { method: 'HEAD', signal, cache: 'no-store' }).catch(() => null);
    if (signal.aborted) throw new SemanticRefusal('semantic_closed');
    const code = probe?.status === 404 ? codes[0] : codes[1];
    failures.push(code);
    throw new SemanticRefusal(code);
  };
}

const assertOpen = owner => {
  if (owner.closed) throw new SemanticRefusal('semantic_closed');
};
const assertReady = owner => {
  assertOpen(owner);
  if (owner.state !== 'ready') throw new SemanticRefusal(owner.reason ?? 'semantic_initializing');
};
const validVector = vector => {
  if (!(vector instanceof Float32Array) || vector.length !== PRODUCER.space.dims) return false;
  let norm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) return false;
    norm += value * value;
  }
  return Math.abs(Math.sqrt(norm) - 1) <= 1e-5;
};

// 768-d sentence embedding -> first 256 dims, L2-normalized in float64 (the native rule).
function project(embedding) {
  const data = embedding?.data;
  if (embedding?.dims?.at(-1) !== PRODUCER.space.native_dims || data?.length !== PRODUCER.space.native_dims
    || !data.every(Number.isFinite)) throw new SemanticRefusal('semantic_native_vector_invalid');
  let norm = 0;
  for (let index = 0; index < PRODUCER.space.dims; index += 1) norm += data[index] * data[index];
  norm = Math.sqrt(norm);
  if (!(norm > 0)) throw new SemanticRefusal('semantic_vector_zero');
  const vector = Float32Array.from(data.subarray(0, PRODUCER.space.dims), value => value / norm);
  if (!validVector(vector)) throw new SemanticRefusal('semantic_vector_invalid');
  return vector;
}

/**
 * An admitted, bounded vector index with a lifecycle independent of model sessions.
 * The handle exposes only deletion and counts. There is deliberately no caller
 * insert, load, vector import or serialization API: only the verified producer's
 * encoding path can populate it. Callers must still supply a fresh host grant
 * for every lookup. Keep this handle in the host realm across producer disposal.
 */
export function createMemoryIndex({ capacity = DEFAULT_INDEX_CAPACITY } = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('index capacity must be a positive safe integer');
  const state = { entries: new Map(), capacity, generation: 0 };
  const index = Object.freeze({
    get size() { return state.entries.size; },
    get capacity() { return capacity; },
    clear() { state.entries.clear(); state.generation += 1; },
    /** Forget all revisions of a source; deletion never requires model inference. */
    forgetSource({ tenant, principal, source_ref }) {
      if (!nonempty(tenant) || !nonempty(principal) || !nonempty(source_ref)) {
        throw new SemanticRefusal('semantic_source_invalid');
      }
      state.generation += 1;
      for (const [key, entry] of state.entries) {
        const scope = entry.scope;
        if (scope.tenant === tenant && scope.principal === principal && scope.source_ref === source_ref) {
          state.entries.delete(key);
        }
      }
    },
  });
  INDEX_STATES.set(index, state);
  return index;
}

const resolveIndex = (owner, index) => {
  if (index === undefined) return owner.defaultIndex;
  if (index instanceof Map || INDEX_STATES.has(index)) return index;
  throw new SemanticRefusal('semantic_cache_invalid');
};

function readIndexed(owner, index, key) {
  const state = INDEX_STATES.get(index);
  if (!state) return cached(owner, index, key);
  const entry = state.entries.get(key);
  if (!entry || !validVector(entry.vector)) return null;
  // Recency is measured on admitted reads, not arbitrary host input.
  state.entries.delete(key);
  state.entries.set(key, entry);
  return entry.vector;
}

function writeIndexed(owner, index, key, vector, scope) {
  assertReady(owner);
  const state = INDEX_STATES.get(index);
  if (state) {
    state.entries.delete(key);
    state.entries.set(key, { vector: vector.slice(), scope });
    while (state.entries.size > state.capacity) {
      state.entries.delete(state.entries.keys().next().value);
    }
    return;
  }
  const token = Object.freeze({ schema: CACHE_SCHEMA });
  // Legacy Map values remain opaque and bound to this exact producer.
  owner.entries.set(token, { key, vector: vector.slice() });
  index.set(key, token);
  trackIndex(owner, index);
}

async function ensureIndexed(producer, owner, index, { record, key, scope }) {
  assertReady(owner);
  const existing = readIndexed(owner, index, key);
  if (existing) return existing;
  const state = INDEX_STATES.get(index);
  const generation = state?.generation;
  // Coalesce concurrent corpus encodes, including recalls using different
  // index handles. The model result is still admitted separately to each.
  let pending = owner.pendingVectors.get(key);
  if (!pending) {
    pending = producer.encode(recordItem(record));
    owner.pendingVectors.set(key, pending);
    pending.then(() => {
      if (owner.pendingVectors.get(key) === pending) owner.pendingVectors.delete(key);
    }, () => {
      if (owner.pendingVectors.get(key) === pending) owner.pendingVectors.delete(key);
    });
  }
  const vector = await pending;
  assertReady(owner);
  if (state && state.generation !== generation) throw new SemanticRefusal('semantic_index_invalidated');
  // If another waiter won the race, reuse its admitted entry.
  const winner = readIndexed(owner, index, key);
  if (winner) return winner;
  writeIndexed(owner, index, key, vector, scope);
  return vector;
}

function admittedCandidates(owner, grant, records) {
  if (!validGrant(grant)) throw new SemanticRefusal('identity_missing');
  if (!Array.isArray(records)) throw new SemanticRefusal('semantic_input_invalid');
  const granted = new Set(grant.sources);
  if (records.some(record => !granted.has(record?.source_ref))) throw new SemanticRefusal('permission_denied');
  const scope = { principal: grant.principal, tenant: grant.tenant };
  return records.map(record => ({
    record: { ...record }, key: cacheKey(owner, scope, record),
    scope: { ...scope, source_ref: record.source_ref },
  }));
}

function clearCaches(owner) {
  // Only remove tokens this producer admitted; a caller's other entries remain theirs.
  for (const ref of owner.indexes) {
    const index = ref.deref();
    if (index) for (const [key, token] of index) if (owner.entries.has(token)) index.delete(key);
  }
  owner.indexes.clear();
  owner.entries = new WeakMap();
}

/**
 * Open one producer per transformers.js environment. Await `dispose()` before
 * replacing it. Disposal closes admission immediately, then waits for existing
 * work before releasing sessions; it does not promise that WASM memory shrinks.
 */
export function createProducer({ transformers, modelBase, runtimeBase, device = 'wasm', index } = {}) {
  if (index !== undefined && !INDEX_STATES.has(index)) throw new SemanticRefusal('semantic_cache_invalid');
  const { env, AutoConfig, AutoModel, AutoProcessor, RawImage } = transformers;
  const failures = [];
  const owner = {
    state: 'initializing', reason: null, identity: null, encodes: 0, timings: {}, requested: [],
    closed: false, active: new Set(), entries: new WeakMap(), indexes: new Set(), seenIndexes: new WeakSet(),
    pendingVectors: new Map(), defaultIndex: index ?? createMemoryIndex(),
    abort: new AbortController(), model: null, processor: null, acquired: false,
  };
  const producer = {
    get state() { return owner.state; },
    get reason() { return owner.reason; },
    get identity() { return owner.identity; },
    get encodes() { return owner.encodes; },
    get error() { return owner.error; },
    // Pass this admitted index into a replacement producer to reuse its corpus.
    get index() { return owner.defaultIndex; },
    timings: owner.timings,
    requested: owner.requested,
  };
  OWNERS.set(producer, owner);
  const wasm = env.backends.onnx.wasm;
  let cleanup;
  let disposal;
  let factoryUrl;
  let binary;
  let paths;
  let previous;
  let configured;

  const release = () => {
    if (!cleanup) cleanup = (async () => {
      const model = owner.model;
      owner.model = owner.processor = null;
      try {
        if (model) await model.dispose();
      } finally {
        const ownsPaths = wasm.wasmPaths === paths && paths?.mjs === factoryUrl
          && paths !== undefined && Reflect.ownKeys(paths).length === 1;
        if (factoryUrl) URL.revokeObjectURL(factoryUrl);
        factoryUrl = undefined;
        if (owner.acquired && ENVIRONMENT_OWNERS.get(env) === owner) {
          // Respect changes a host made after our configuration.
          for (const key of Object.keys(configured)) {
            if (env[key] === configured[key]) env[key] = previous.env[key];
          }
          if (wasm.wasmBinary === binary) wasm.wasmBinary = previous.binary;
          if (ownsPaths) wasm.wasmPaths = previous.paths;
          ENVIRONMENT_OWNERS.delete(env);
        }
        binary = paths = previous = configured = undefined;
        owner.acquired = false;
        clearCaches(owner);
        owner.pendingVectors.clear();
      }
    })();
    return cleanup;
  };

  producer.ready = (async () => {
    const started = performance.now();
    try {
      if (ENVIRONMENT_OWNERS.has(env)) throw new SemanticRefusal('semantic_producer_in_use');
      const runtimeNames = runtimeFiles(device);
      const fetch = pinnedFetch(modelBase, runtimeBase, runtimeNames, failures, owner.requested, owner.abort.signal);
      configured = {
        allowRemoteModels: false, allowLocalModels: true, localModelPath: modelBase,
        useBrowserCache: false, fetch, useWasmCache: false,
      };
      previous = { env: Object.fromEntries(Object.keys(configured).map(key => [key, env[key]])),
        binary: wasm.wasmBinary, paths: wasm.wasmPaths };
      ENVIRONMENT_OWNERS.set(env, owner);
      owner.acquired = true;
      Object.assign(env, configured);
      owner.identity = Object.freeze(await producerIdentity(device));
      assertOpen(owner);
      const [factory, bytes] = await Promise.all(
        runtimeNames
          .map(name => fetch(`${runtimeBase}${name}`).then(response => {
            assertOpen(owner);
            return response.arrayBuffer();
          })));
      assertOpen(owner);
      binary = bytes;
      factoryUrl = URL.createObjectURL(new Blob([factory], { type: 'text/javascript' }));
      paths = { mjs: factoryUrl };
      wasm.wasmBinary = binary;
      wasm.wasmPaths = paths;
      owner.timings.runtime_ms = performance.now() - started;
      const config = await AutoConfig.from_pretrained(MODEL_DIR);
      assertOpen(owner);
      config.audio_config = null; // text and image encoders only
      owner.processor = await AutoProcessor.from_pretrained(MODEL_DIR);
      assertOpen(owner);
      owner.model = await AutoModel.from_pretrained(MODEL_DIR, { config, device, dtype: { ...PRODUCER.dtype } });
      assertOpen(owner);
      if (failures.length) throw new SemanticRefusal(failures[0]);
      owner.state = 'ready';
      owner.timings.initialize_ms = performance.now() - started;
      return producer;
    } catch (error) {
      if (!owner.closed) {
        owner.state = 'unavailable';
        owner.reason = failures[0] ?? (error instanceof SemanticRefusal ? error.code : 'runtime_unavailable');
      }
      owner.error = String(error?.message ?? error);
      await release().catch(cleanupError => { owner.error += `; cleanup: ${cleanupError?.message ?? cleanupError}`; });
      throw new SemanticRefusal(owner.reason);
    }
  })();
  producer.ready.catch(() => {});

  /** Encode one item; an admitted operation is tracked before its first await. */
  producer.encode = item => {
    try { assertReady(owner); } catch (error) { return Promise.reject(error); }
    const operation = Promise.resolve().then(async () => {
      assertReady(owner);
      let inputs;
      if (item.input_kind === 'text') {
        if (!item.text) throw new SemanticRefusal('semantic_input_empty');
        const text = item.task === 'document'
          ? `title: ${item.title || 'none'} | text: ${item.text}`
          : `task: ${TASKS[item.task] ?? (() => { throw new SemanticRefusal('semantic_profile_input_mismatch'); })()} | query: ${item.text}`;
        inputs = await owner.processor(text);
      } else if (item.input_kind === 'media' && item.kind === 'image') {
        const image = await RawImage.fromBlob(new Blob([item.bytes], { type: item.mime }));
        assertOpen(owner);
        inputs = await owner.processor(null, [[image]]);
      } else {
        throw new SemanticRefusal('unsupported_modality');
      }
      assertOpen(owner);
      const { sentence_embedding } = await owner.model(inputs);
      owner.encodes += 1;
      assertOpen(owner);
      return project(sentence_embedding);
    });
    owner.active.add(operation);
    operation.then(() => owner.active.delete(operation), () => owner.active.delete(operation));
    return operation;
  };

  /** Close immediately; settle initialization and in-flight work before releasing resources. */
  producer.dispose = () => {
    if (!disposal) {
      owner.closed = true;
      owner.state = 'closed';
      owner.reason = 'semantic_closed';
      owner.abort.abort();
      clearCaches(owner);
      disposal = (async () => {
        await producer.ready.catch(() => {});
        await Promise.allSettled([...owner.active]);
        await release();
      })();
    }
    return disposal;
  };
  return Object.freeze(producer);
}

const dot = (left, right) => left.reduce((total, value, index) => total + value * right[index], 0);
const recordItem = record => (record.kind === 'image'
  ? { input_kind: 'media', kind: 'image', bytes: record.bytes, mime: record.mime }
  : { input_kind: 'text', task: 'document', text: record.text, title: record.title ?? null });
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validGrant = grant => nonempty(grant?.principal) && nonempty(grant?.tenant)
  && Array.isArray(grant.sources) && grant.sources.every(nonempty);

function cacheKey(owner, grant, record) {
  if (!nonempty(record?.source_ref) || !nonempty(record.source_revision)
    || (record.item_id !== undefined && !nonempty(record.item_id))) {
    throw new SemanticRefusal('semantic_source_invalid');
  }
  const identity = owner.identity;
  const profile = record.kind === 'image' ? ['media', 'media_corpus', 'image'] : ['text', 'document'];
  // JSON tuples preserve component boundaries, including '@' in source names/revisions.
  return JSON.stringify([CACHE_SCHEMA, grant.tenant, grant.principal, identity.model_id, identity.checkpoint_digest,
    identity.semantic_space_id, identity.producer_revision, 'theorem.semantic/1', profile,
    record.source_ref, record.source_revision, record.item_id ?? null]);
}

function cached(owner, index, key) {
  const entry = owner.entries.get(index.get(key));
  return entry?.key === key && validVector(entry.vector) ? entry.vector : null;
}

function trackIndex(owner, index) {
  if (!owner.seenIndexes.has(index)) {
    owner.seenIndexes.add(index);
    for (const ref of owner.indexes) if (!ref.deref()) owner.indexes.delete(ref);
    owner.indexes.add(new WeakRef(index));
  }
}

/** A copy of a current producer's admitted cached vector, or null; never a raw caller-supplied value. */
export function cachedVector(producer, { grant, record, index }) {
  const owner = OWNERS.get(producer);
  if (!owner || owner.closed || owner.state !== 'ready' || !validGrant(grant)
    || !grant.sources.includes(record?.source_ref)) return null;
  try {
    return readIndexed(owner, resolveIndex(owner, index), cacheKey(owner, grant, record))?.slice() ?? null;
  } catch { return null; }
}

/**
 * Independently index changed or newly admitted sources during ingestion.
 * Every record is granted and versioned before encoding, and every vector is
 * generated by this producer. A concurrent recall awaits the same encode.
 */
export async function indexRecords(producer, { grant, records, index } = {}) {
  const owner = OWNERS.get(producer);
  if (!owner) return refusal('semantic_producer_invalid');
  try {
    const candidates = admittedCandidates(owner, grant, records);
    const cache = resolveIndex(owner, index);
    const state = INDEX_STATES.get(cache);
    const generation = state?.generation;
    assertReady(owner);
    for (const candidate of candidates) {
      if (state && state.generation !== generation) throw new SemanticRefusal('semantic_index_invalidated');
      await ensureIndexed(producer, owner, cache, candidate);
    }
    assertReady(owner);
    if (state && state.generation !== generation) throw new SemanticRefusal('semantic_index_invalidated');
    return {
      indexed: candidates.length,
      semantic_receipt: { status: 'admitted', required: true, ...owner.identity,
        principal: grant.principal, tenant: grant.tenant, candidates: candidates.length },
      completion_state: 'completed',
    };
  } catch (error) {
    return refusal(error instanceof SemanticRefusal ? error.code : 'semantic_input_or_inference_failed');
  }
}

/**
 * Rank granted records and shape the top results with XERJ. Normal retrieval
 * reads the retained admitted index; missing records are encoded on demand
 * without silently downgrading semantic recall to lexical or partial results.
 * `index` may be an existing opaque-token Map or a producer-independent
 * createMemoryIndex() handle; omitted indexes use a bounded retained store.
 */
export async function recall(producer, { grant, query, records, limit, admitRecall, index } = {}) {
  if (!validGrant(grant)) return refusal('identity_missing');
  if (!Array.isArray(records)) return refusal('semantic_input_invalid');
  const granted = new Set(grant.sources);
  if (records.some(record => !granted.has(record?.source_ref))) return refusal('permission_denied');
  if (typeof query !== 'string' || !query) return refusal('semantic_input_empty');
  const owner = OWNERS.get(producer);
  if (!owner) return refusal('semantic_producer_invalid');
  try {
    assertReady(owner);
    // Snapshot identity and record fields across async encoding; callers still own disclosure.
    const identity = { principal: grant.principal, tenant: grant.tenant };
    const candidates = admittedCandidates(owner, grant, records);
    const cache = resolveIndex(owner, index);
    const state = INDEX_STATES.get(cache);
    const generation = state?.generation;
    const assertIndexCurrent = () => {
      if (state && state.generation !== generation) throw new SemanticRefusal('semantic_index_invalidated');
    };
    const target = await producer.encode({ input_kind: 'text', task: 'search_query', text: query });
    assertReady(owner);
    assertIndexCurrent();
    const scored = [];
    for (const candidate of candidates) {
      const vector = await ensureIndexed(producer, owner, cache, candidate);
      assertReady(owner);
      assertIndexCurrent();
      scored.push({ record: candidate.record, score: dot(target, vector) });
    }
    scored.sort((left, right) => right.score - left.score);
    const ranked = scored.map(({ record, score }) => ({
      id: record.item_id ?? record.source_ref,
      updated_at: record.source_revision,
      title: record.title,
      gist: record.kind === 'image' ? `${record.kind}: ${record.title}` : record.text,
      kind: record.kind,
      score,
      ...(record.item_id === undefined ? {} : {
        provenance: { source_id: record.source_ref, source_revision: record.source_revision },
      }),
    }));
    const packet = JSON.parse(admitRecall(JSON.stringify(ranked), limit));
    assertReady(owner);
    assertIndexCurrent();
    return {
      ...packet,
      ranking: ranked.map(({ id, score }) => ({ id, score })),
      semantic_receipt: {
        status: 'admitted', required: true, ...owner.identity,
        principal: identity.principal, tenant: identity.tenant, candidates: records.length,
      },
      completion_state: 'completed',
    };
  } catch (error) {
    return refusal(error instanceof SemanticRefusal ? error.code : 'semantic_input_or_inference_failed');
  }
}
