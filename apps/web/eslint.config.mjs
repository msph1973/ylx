import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import astro from 'eslint-plugin-astro';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['.vercel/**', 'dist/**', 'node_modules/**', '.astro/**'],
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // No any — does not require type-information
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // General
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
  // Astro files
  ...astro.configs.recommended,
];
