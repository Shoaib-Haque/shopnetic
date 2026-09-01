import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared flat ESLint config. See plan/CODING-RULES.md — key enforced rules:
 *  - no `any` (§B1)
 *  - no `console.*` in app code (§O1)
 * Framework-specific configs (next, nest) extend this array.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const base = [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSUnknownKeyword',
          message: 'Avoid `as unknown as` casts (CODING-RULES §B5).',
        },
      ],
    },
  },
  prettier,
];

export default base;
