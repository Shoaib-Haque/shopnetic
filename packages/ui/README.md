# @shopnetic/ui

Shared component library — shadcn/Radix primitives wrapped in project components
that own theming, variants, the `'use client'` boundary, and built-in
loading/disabled behaviour. App code imports from here, never from shadcn/Radix
directly (`plan/CODING-RULES.md` section D1).

Consumed as **source** — each Next app lists `@shopnetic/ui` in
`transpilePackages`. Import `@shopnetic/ui/tokens.css` once in the app's global
stylesheet, and spread `@shopnetic/ui/tailwind` into the app's Tailwind preset.

Components so far: `Button`, `Spinner`, `Input` (with `invalid`), `PasswordInput`
(Input + a show/hide eye toggle; `showLabel`/`hideLabel` passed translated),
`Field` (label + control + hint/error). `Link`, `Dialog`, `Table`, `EmptyState`,
etc. land as features need them.

Use `PasswordInput` for **every** password field (CODING-RULES section D3).
