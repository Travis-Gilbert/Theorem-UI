#!/usr/bin/env node
// Stages the browser Q8 producer's same-origin assets from the pins in
// vendor/semantic-q8/lock.json, and verifies every byte against them.
//
//   node scripts/semantic-q8/stage.mjs [--out DIR] [--code-only]
//                                      [--model-source DIR] [--verify]
//
// Two directories, by design. Without --code-only the whole served tree goes to
// .semantic-q8/v1 (override: THEOREM_SEMANTIC_Q8_DIR), weights included, for the
// Bun server and real-browser runs. With --code-only just the small pinned code
// goes to .semantic-q8/public, which is what vite.config.ts ships as static
// assets: it can never contain a model, so no ignore glob stands between a
// 313 MB weight file and a Worker's 25 MiB asset limit.
//
// The output is the directory served at /semantic/q8/v1/:
//   producer/semantic.js            vendored, byte-identical to the Theorem commit
//   transformers/transformers.js    npm tarball, checked against its sha512
//   runtime/ort-wasm-simd-threaded.{mjs,wasm}   the plain CPU build only
//   models/<repository>/<file>      the pinned ONNX export (omitted by --code-only)
//   manifest.json                   the pin table, written last
//
// A file already present must match its pinned digest or staging refuses; it is
// never replaced. Nothing here reads or writes a credential. The only network
// use is the two npm tarballs and, without --model-source, the pinned model
// revision on huggingface.co (the same download Theorem's install-model.mjs
// makes).
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function readLock() {
  return JSON.parse(
    await readFile(join(root, 'vendor/semantic-q8/lock.json'), 'utf8'),
  )
}

export async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

const exists = (path) =>
  stat(path).then(
    (info) => info,
    () => null,
  )

/** Throws unless `path` is exactly the pinned file. */
async function check(path, { sha256: expected, bytes }, label) {
  const info = await exists(path)
  if (!info) throw new Error(`missing: ${label}`)
  if (info.size !== bytes)
    throw new Error(`size_mismatch: ${label} is ${info.size}, pinned ${bytes}`)
  if ((await sha256(path)) !== expected)
    throw new Error(`digest_mismatch: ${label} differs from its pin`)
}

/** Places a file already verified at `source` into the stage, once. */
async function place(source, target, pin, label) {
  if (await exists(target)) {
    await check(target, pin, label)
    return 'verified'
  }
  await mkdir(dirname(target), { recursive: true })
  const partial = `${target}.part`
  await copyFile(source, partial)
  await check(partial, pin, label).catch(async (error) => {
    await unlink(partial)
    throw error
  })
  await rename(partial, target)
  return 'staged'
}

/** Downloads one URL, hashing as it writes, and keeps it only if it matches. */
async function download(url, target, pin, label) {
  await mkdir(dirname(target), { recursive: true })
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`download_failed: ${label} answered ${response.status}`)
  const partial = `${target}.part`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
  await check(partial, pin, label).catch(async (error) => {
    await unlink(partial)
    throw error
  })
  await rename(partial, target)
}

async function stageNpm(lock, out, scratch, log) {
  for (const pkg of lock.npm) {
    const label = `${pkg.name}@${pkg.version}`
    const targets = pkg.files.map((file) => join(out, file.serve))
    const present = await Promise.all(targets.map(exists))
    if (present.every(Boolean)) {
      for (const [index, file] of pkg.files.entries())
        await check(targets[index], file, `${label} ${file.serve}`)
      log(`verified ${label}`)
      continue
    }
    const tarball = join(scratch, `${pkg.name.replace(/\W/g, '_')}.tgz`)
    const response = await fetch(pkg.tarball)
    if (!response.ok)
      throw new Error(`download_failed: ${label} answered ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tarball))
    // npm's own integrity value, before anything is unpacked.
    const [algorithm, expected] = pkg.integrity.split('-')
    const hash = createHash(algorithm)
    for await (const chunk of createReadStream(tarball)) hash.update(chunk)
    if (hash.digest('base64') !== expected)
      throw new Error(`integrity_mismatch: ${label} tarball`)
    const unpacked = join(scratch, `unpacked-${pkg.name.replace(/\W/g, '_')}`)
    await mkdir(unpacked, { recursive: true })
    await run('tar', [
      '-xzf',
      tarball,
      '-C',
      unpacked,
      ...pkg.files.map((file) => file.from),
    ])
    for (const [index, file] of pkg.files.entries())
      await place(
        join(unpacked, file.from),
        targets[index],
        file,
        `${label} ${file.serve}`,
      )
    log(`staged ${label}`)
  }
}

async function stageModel(lock, out, source, log) {
  const { repository, revision, upstream, files } = lock.model
  for (const file of files) {
    const target = join(out, 'models', repository, file.name)
    const label = `model ${file.name}`
    if (await exists(target)) {
      await check(target, file, label)
      log(`verified ${label}`)
    } else if (source) {
      await place(join(source, file.name), target, file, label)
      log(`staged ${label} from ${source}`)
    } else {
      await download(`${upstream}${file.name}`, target, file, label)
      log(`downloaded ${label} (revision ${revision.slice(0, 7)})`)
    }
  }
}

/** Verifies a finished stage without touching the network. */
export async function verifyStage(out, { codeOnly = false } = {}) {
  const lock = await readLock()
  await check(
    join(out, lock.producer.serve),
    lock.producer,
    'producer/semantic.js',
  )
  for (const pkg of lock.npm)
    for (const file of pkg.files)
      await check(join(out, file.serve), file, file.serve)
  if (!codeOnly)
    for (const file of lock.model.files)
      await check(
        join(out, 'models', lock.model.repository, file.name),
        file,
        `model ${file.name}`,
      )
  return lock
}

export async function stage({
  out,
  codeOnly = false,
  modelSource,
  log = console.log,
}) {
  const lock = await readLock()
  if (codeOnly && (await exists(join(out, 'models'))))
    throw new Error(
      `refused: ${out} holds models; a code-only stage is the directory a build ships`,
    )
  await check(join(root, lock.producer.file), lock.producer, lock.producer.file)
  const scratch = await mkdtemp(join(tmpdir(), 'semantic-q8-'))
  try {
    log(
      (await place(
        join(root, lock.producer.file),
        join(out, lock.producer.serve),
        lock.producer,
        lock.producer.serve,
      )) + ' producer/semantic.js',
    )
    await stageNpm(lock, out, scratch, log)
    if (!codeOnly) await stageModel(lock, out, modelSource, log)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
  await verifyStage(out, { codeOnly })
  const files = [lock.producer, ...lock.npm.flatMap((pkg) => pkg.files)].map(
    ({ serve, sha256: digest, bytes }) => ({
      path: serve,
      sha256: digest,
      bytes,
    }),
  )
  // The manifest is the pin table, the same whether or not the weights are
  // staged beside it: --code-only must not make a full stage look partial.
  files.push(
    ...lock.model.files.map(({ name, sha256: digest, bytes }) => ({
      path: `models/${lock.model.repository}/${name}`,
      sha256: digest,
      bytes,
    })),
  )
  const manifest = {
    schema: 'theorem-ui.semantic-q8-manifest/1',
    version: lock.version,
    model: { repository: lock.model.repository, revision: lock.model.revision },
    files,
  }
  await writeFile(
    join(out, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  const option = (name) => {
    const index = args.indexOf(name)
    return index === -1 ? undefined : args[index + 1]
  }
  const known = new Set(['--out', '--model-source', '--code-only', '--verify'])
  const unknown = args.filter((arg, index) =>
    arg.startsWith('--')
      ? !known.has(arg)
      : !['--out', '--model-source'].includes(args[index - 1]),
  )
  if (unknown.length) {
    console.error(`unknown argument: ${unknown[0]}`)
    process.exit(2)
  }
  const codeOnly = args.includes('--code-only')
  // Code assets ship in the build, so they stage apart from the weights: a
  // build can then only ever copy a directory that has no models in it.
  const out = resolve(
    option('--out') ??
      (codeOnly
        ? join(root, '.semantic-q8/public')
        : (process.env.THEOREM_SEMANTIC_Q8_DIR ??
          join(root, '.semantic-q8/v1'))),
  )
  const modelSource =
    option('--model-source') ?? process.env.THEOREM_SEMANTIC_Q8_MODEL_SOURCE
  try {
    if (args.includes('--verify')) {
      await verifyStage(out, { codeOnly })
      console.log(`verified ${out}`)
    } else {
      const manifest = await stage({
        out,
        codeOnly,
        modelSource: modelSource && resolve(modelSource),
      })
      console.log(`staged ${manifest.files.length} files in ${out}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
