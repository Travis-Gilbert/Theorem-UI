// The declarations an App is checked against, read from node_modules the way
// app-check-library.ts has Vite read them.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { CheckLibrary } from '@/lib/blocks/app-check'
import { theoremAppDeclarations } from '@/lib/blocks/check/theorem-app.generated'

const MODULES = path.resolve(import.meta.dirname, '../../node_modules')

function add(files: CheckLibrary, directory: string, served: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) add(files, file, `${served}/${entry.name}`)
    else if (entry.name.endsWith('.d.ts') || entry.name === 'package.json')
      files[`${served}/${entry.name}`] = readFileSync(file, 'utf8')
  }
}

export function checkLibraryFromDisk(): CheckLibrary {
  const files: CheckLibrary = {}
  for (const name of ['@types/react', '@types/react-dom', 'csstype'])
    add(files, path.join(MODULES, name), `/node_modules/${name}`)
  for (const [name, text] of Object.entries(theoremAppDeclarations))
    files[`/node_modules/@theorem/app/${name}`] = text
  return files
}
