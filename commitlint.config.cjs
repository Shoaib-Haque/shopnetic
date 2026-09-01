/**
 * Conventional Commits — see plan/CODING-RULES.md §J4.
 * Example: feat(checkout): add address step
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-case': [2, 'always', 'kebab-case'],
    'body-max-line-length': [0, 'always', 100],
  },
};
