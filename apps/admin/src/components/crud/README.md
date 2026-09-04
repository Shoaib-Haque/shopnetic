# components/crud

Shared building blocks for the admin CRUD pages (plan/23-project-structure.md).
Compose these per entity under `src/features/<domain>/`.

| Component       | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `PageHeader`    | Title + one-line description + right-aligned action slot.           |
| `ActionButton`  | `Button` + leading icon + optionally responsive label (`+ New`, …). |
| `ConfirmDialog` | Small yes/no modal — deletes, discard-changes prompts.              |
| `FormModal`     | Centered modal wrapping a form; unsaved-changes guard when `dirty`. |

Generic strings live in the `admin` message namespace (`actions.*`, `form.*`,
`list.*`). Infinite-scroll list scaffolding lands with the first non-tree list
(Brands).
