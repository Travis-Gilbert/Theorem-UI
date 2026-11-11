// SOURCING: hand-written over the JSON Schema a block contract already carries in
// `capabilities[].input_schema`: nothing upstream maps that schema onto these four
// controls and the port-shape extension.
import type { ProgramNode } from './contracts'

export type Parameter = {
  name: string
  title: string
  control: 'code' | 'combo' | 'json' | 'number' | 'text' | 'toggle'
  /** The language a code parameter is written in. */
  language?: string
  options: Array<string>
  defaultValue: unknown
  /** The shape an input port takes when this parameter arrives on one. */
  portShape?: string
}

type Declaration = {
  type?: string
  title?: string
  enum?: Array<unknown>
  default?: unknown
  'x-port-shape'?: string
  'x-control'?: 'code' | 'json'
  'x-language'?: string
}

const controlOf = (
  declaration: Declaration,
): Parameter['control'] | undefined => {
  if (declaration['x-control']) return declaration['x-control']
  if (declaration.enum) return 'combo'
  if (declaration.type === 'number' || declaration.type === 'integer')
    return 'number'
  if (declaration.type === 'boolean') return 'toggle'
  if (declaration.type === 'string') return 'text'
  return undefined
}

/** Code and JSON take an editor's room, so they live in the inspector, not on the node. */
export const isLongParameter = (parameter: Parameter) =>
  parameter.control === 'code' || parameter.control === 'json'

/** What the node's contract lets a person set, in the order it declares them. */
export function declaredParameters(node: ProgramNode): Array<Parameter> {
  return node.contract.capabilities.flatMap((capability) => {
    const schema = capability.input_schema as {
      properties?: Record<string, Declaration>
    } | null
    return Object.entries(schema?.properties ?? {}).flatMap(
      ([name, declaration]) => {
        const control = controlOf(declaration)
        if (!control) return []
        return [
          {
            name,
            title: declaration.title ?? name.replaceAll('_', ' '),
            control,
            language: declaration['x-language'],
            options: (declaration.enum ?? []).map(String),
            defaultValue: declaration.default,
            portShape: declaration['x-port-shape'],
          },
        ]
      },
    )
  })
}
