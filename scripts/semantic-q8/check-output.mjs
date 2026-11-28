#!/usr/bin/env node
// Fails a build whose public output carries a Q8 model or a file past a Worker's
// 25 MiB static asset limit.
//
//   node scripts/semantic-q8/check-output.mjs [.output/public]
import { readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 25 * 1024 * 1024

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

export async function checkOutput(publicDir) {
  const q8 = join(resolve(publicDir), 'semantic/q8')
  const problems = []
  const present = await stat(q8).then(
    () => true,
    () => false,
  )
  if (present) {
    for await (const path of files(q8)) {
      const name = relative(q8, path)
      if (/(^|\/)models\//.test(name) || /\.onnx(_data)?$/.test(name))
        problems.push(`model in the build output: semantic/q8/${name}`)
      else if ((await stat(path)).size >= LIMIT)
        problems.push(`past the Worker asset limit: semantic/q8/${name}`)
    }
  }
  return problems
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = process.argv[2] ?? '.output/public'
  const problems = await checkOutput(dir)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`${dir}: no Q8 model or oversized asset`)
}
