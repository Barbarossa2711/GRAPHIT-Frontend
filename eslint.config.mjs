/**
 * ESLint, deliberately limited to the two React Hooks rules. Types are checked by tsc,
 * formatting by Prettier and behaviour by Vitest; ESLint catches patterns that compile
 * but break at runtime (e.g. a hook behind an early return).
 */

import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    // Everything that is not our source (the JupyterLab wheel in .venv ships bundled JS).
    ignores: [
      'lib/**',
      'node_modules/**',
      'graphit_jupyter/**',
      'dist/**',
      '.venv/**',
      'style/**'
    ]
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // A hook called conditionally is a runtime crash, not a matter of taste.
      'react-hooks/rules-of-hooks': 'error',
      // An incomplete dependency list shows up as "the view does not update" somewhere
      // else entirely — a warning, because the fix is sometimes a deliberate omission.
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
