// Imports a compiled cell module in the test process. The file goes under
// node_modules/.cache so its imports (react, react/jsx-runtime) resolve the
// way they would in a block document through the import map.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CompiledCell } from '@/lib/blocks/compile'
import type { CellModule } from '@/lib/blocks/sandbox/cell'

const dir = path.join(process.cwd(), 'node_modules/.cache/theorem-blocks-test')

export async function loadCell(cell: CompiledCell): Promise<CellModule> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${cell.key}.mjs`)
  await writeFile(file, cell.code)
  return (await import(file)) as CellModule
}
