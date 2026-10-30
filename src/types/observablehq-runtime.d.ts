// SOURCING: types for @observablehq/runtime, which ships none; they describe
// the API its README documents (Runtime, Module, Variable, observers).
declare module '@observablehq/runtime' {
  export interface Observer {
    pending?: () => void
    fulfilled?: (value: unknown, name?: string | null) => void
    rejected?: (error: unknown, name?: string | null) => void
  }

  export type VariableDefinition = (...inputs: Array<never>) => unknown

  export class Variable {
    define(definition: VariableDefinition): this
    define(name: string | null, definition: VariableDefinition): this
    define(inputs: Array<string>, definition: VariableDefinition): this
    define(
      name: string | null,
      inputs: Array<string>,
      definition: VariableDefinition,
    ): this
    delete(): this
  }

  export class Module {
    variable(observer?: Observer | boolean): Variable
    define(
      name: string,
      inputs: Array<string>,
      definition: VariableDefinition,
    ): Variable
    value(name: string): Promise<unknown>
  }

  export class Runtime {
    constructor(
      builtins?: Record<string, unknown>,
      global?: (name: string) => unknown,
    )
    module(): Module
    dispose(): void
  }

  export class RuntimeError extends Error {
    input?: string
  }
}
