# @shopnetic/config

Shared build/lint/format/style configuration. No runtime code.

| Export                                      | Use                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@shopnetic/config/eslint`                  | `import { base } from '@shopnetic/config/eslint'` in each package's `eslint.config.js` |
| `@shopnetic/config/tsconfig/base.json`      | non-framework TS packages                                                              |
| `@shopnetic/config/tsconfig/next.json`      | Next.js apps                                                                           |
| `@shopnetic/config/tsconfig/nest.json`      | NestJS app                                                                             |
| `@shopnetic/config/tsconfig/react-lib.json` | `@shopnetic/ui`                                                                        |
| `@shopnetic/config/tailwind`                | Tailwind preset (design tokens) for all frontends                                      |

Strict TS everywhere (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`) — see `plan/CODING-RULES.md` section B2.
