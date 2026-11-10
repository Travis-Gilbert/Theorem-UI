export const LAYERS: readonly ['line', 'accent', 'tint', 'paper']
export type IconSet = {
  dir: string
  icons: ReadonlyArray<{ name: string; source: string; autofill?: boolean }>
  table: string
  type: string
  what: string
}
export const SETS: IconSet[]
export function layersDir(set: IconSet): URL
export function split(pixel: number[]): Record<(typeof LAYERS)[number], number>
export function layerFiles(set: IconSet): Promise<Map<string, Buffer | string>>
