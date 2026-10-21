//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  ...tanstackConfig,
  reactHooks.configs.flat['recommended-latest'],
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Vendored registry code (assistant-ui elements, shadcn ui, registry hooks)
    // keeps upstream's defensive checks so updates stay diffable.
    files: [
      'src/components/assistant-ui/elements/**',
      'src/components/ui/**',
      'src/hooks/**',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'no-shadow': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'Theorem-UI/**',
      'dist/**',
      '.delta/**',
      '.output/**',
      '.nitro/**',
      'src/routeTree.gen.ts',
    ],
  },
]
