export const LAYERS: readonly ['line', 'accent', 'tint', 'paper']
export const LAYERS_DIR: URL
export function split(pixel: number[]): Record<(typeof LAYERS)[number], number>
export function railFiles(): Promise<Map<string, Buffer | string>>
