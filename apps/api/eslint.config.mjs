import { base } from '@shopnetic/config/eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      // Nest lifecycle hooks + DI often need empty constructors / classes.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
