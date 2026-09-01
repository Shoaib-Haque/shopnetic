import { base } from '@shopnetic/config/eslint';

/**
 * TODO(frontend-lint PR): add `eslint-config-next` (flat) for the React/RSC/
 * a11y rules + the custom "no bare user-facing string" rule (CODING-RULES §L1).
 * @type {import('eslint').Linter.Config[]}
 */
export default [...base, { ignores: ['.next/**', 'next-env.d.ts'] }];
