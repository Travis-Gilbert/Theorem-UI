// SOURCING: types for md-attr-parser, which ships none; they describe its
// documented result (README: `{ prop, eaten }`).
declare module 'md-attr-parser' {
  interface ParsedAttributes {
    prop: {
      id?: string
      class?: Array<string>
      [key: string]: string | Array<string> | undefined
    }
    /** Every character parsed, from the opening brace to the closing one. */
    eaten: string
  }
  export default function parseAttr(
    value: string,
    indexNext?: number,
  ): ParsedAttributes
}
