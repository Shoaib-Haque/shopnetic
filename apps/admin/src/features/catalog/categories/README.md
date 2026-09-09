# Categories — admin reference implementation

The first real back-office CRUD surface. It is deliberately the template for the
list/tree pages that follow (Brands, Option Types, Value Sets, Products): the
patterns below are meant to be lifted, and the CRUD kit
(`src/components/crud/*`, `@shopnetic/ui`) grows out of what repeats here.

User-facing summary lives in `apps/admin/README.md` ("Catalog (back office)").
API side: `apps/api/src/catalog/category.service.ts`, contract
`packages/contracts/src/catalog.ts`. Data model: `plan/07`, `plan/25`, `plan/26`.

---

## Files

| File                      | What                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`                  | thin `adminApi` wrappers — `listCategories`, `createCategory`, `updateCategory`, `reorderCategories`, `deleteCategory`, `restoreCategory`                                                             |
| `category-list.tsx`       | page container: fetch + status filter + search, drag→`applyMove` (optimistic + `applyMoveLocally`), delete→undo, 409-conflict recovery, flash + scroll-into-view, modal wiring, desktop/mobile switch |
| `category-tree.tsx`       | `CategoryTree` (nested + drag + `edgeAutoScroll` + treegrid aria), `CategoryFlatTable` (search / archived), `CategoryCards` (mobile), `buildForest` (+ `orphan`), `TreeGuides`, `useAncestorPath`     |
| `category-form-modal.tsx` | create / edit / view(archived) modal; combined resolver; slug auto-fill; `expectedUpdatedAt` on save; `restoreBlocked` / `onConflict`                                                                 |
| `../error-copy.ts`        | API error `code` → `catalog.errors.*` key                                                                                                                                                             |

---

## Behaviour (implementation notes)

- **Ordering.** `GET /admin/v1/categories` returns rows sorted by the ltree
  `path` (uuid labels), so sibling order is **not** meaningful until the client
  re-sorts. `buildForest` links `parentId`, then sorts each level by
  `position` then name. The `/reorder` service re-sorts its own return the same
  way. A parent missing from the result (archived while a child stays active)
  makes the child a root; the row is flagged with a **"detached" badge** and
  `buildForest` marks the node (`f29ac7b`).
- **Drag zones.** `onDragOver` splits the row: top 30 % = _before_, bottom 30 % =
  _after_, middle = _inside_ (nest). One `POST /admin/v1/categories/reorder`
  `{ parentId, orderedIds }` per drop; ids whose parent changes are reparented
  (ltree path rewrite + cycle check) server-side. Whole row is the drag target
  on desktop; drag is off below `md` (CODING-RULES G8).
- **Optimistic drag** (`ceeb129`). The move is applied to local `items` on drop
  (`applyMoveLocally` — renumber both parents, re-root the moved subtree's
  `path`/`depth` on a reparent), so the row moves in a frame; `load()` reconciles
  and a failed `/reorder` restores the pre-drop snapshot. Edge auto-scroll
  (`34d0bcf`) nudges the scroll container while the pointer sits near its
  top/bottom; the flashed row is `scrollIntoView`'d after a move / undo / no-op
  drop so it can't land off-screen.
- **Undo, not confirm** (CODING-RULES G8). Reorder / reparent / delete apply
  immediately + a 20 s `notify.undo`. Restore keeps a confirm — it names the
  un-archive cascade. `CategoryMove.undoOrderedIds` is the `fromParent`'s child
  order snapshotted at drop time; undo is just another `/reorder` with it. A drop
  that resolves to the row's current position fires `onNoop` → info toast + flash
  instead of vanishing (`6a48ca0`).
- **Concurrent edit** (`1113a8f`). `updateCategory` sends `expectedUpdatedAt`
  (the `updatedAt` the form opened with); the API returns `409 CONFLICT` on a
  mismatch. The modal then closes, refetches, and shows a 5 s toast — a stale
  form can't silently overwrite a newer edit or keep re-conflicting.
- **Accessibility.** The tree `<table>` is `role="treegrid"`; each row carries
  `aria-level`, `aria-expanded` (parents only), `aria-setsize` / `aria-posinset`
  (`acfaa59`). The flat search / archived table stays a plain table.
- **Toasts.** All `notify.*` render one `BarToast` (tone = icon + colour, timer
  bar on every one); duration tracks importance — 3 s default, ~5 s when the
  toast carries an instruction, ~20 s for undo (CODING-RULES G9, `949c36f`).
- **Responsive** (CODING-RULES G7). `< md` → `CategoryCards` (flat,
  parent-then-children `path` order, name + muted "in A › B" + one Edit button;
  Delete/Restore live in the Edit modal). `md–lg` → table minus the Brand column
  (`hidden lg:table-cell`) and with icon-only row actions (`collapseLabel="lg"`).
  `lg+` → full table. `table-fixed` so a long name can't shove columns off-screen.
- **Validation** (CODING-RULES P1, H4). One custom RHF resolver =
  `zodResolver(schema)` **+** a client-side duplicate check against the live
  name/slug sets, so every offending field shows its own inline error in one
  pass. Server error codes still map to a field via `FIELD_FOR_CODE`.
- **Archived = view-only.** `category.archivedAt != null` opens the modal in
  `readOnly` mode (Close, no Save, no discard prompt); the API rejects an update
  to a soft-deleted row anyway.

---

## Reusable patterns (copy these)

1. **Combined resolver** (`category-form-modal.tsx`): wrap `zodResolver` and fold
   in client-side checks (duplicates, cross-field) so all field errors surface
   together instead of one server round-trip at a time.
2. **`dirtyFields`-only save**: on edit, send only changed keys
   (`...(d.slug ? { slug } : {})`) — a no-op save writes no audit event and a
   one-field edit can't trigger an unrelated path rewrite. No-op → just close.
3. **Read-only modal for archived rows**: `FormModal` `readOnly` prop; the row's
   destructive actions (`onDelete` / `onRestore`) move into the modal footer as a
   `secondaryAction` so the mobile card (Edit only) isn't a dead end.
4. **Mobile card list**: `<md` swap the table for one card per row — truncated
   label + muted secondary line + a single primary action; everything else in the
   Edit form. `useAncestorPath` gives the "in A › B" context the indentation
   would.
5. **`notify.undo` flow** (`applyMove`, `doDelete`): mutate → `notify.undo(msg,
{ onUndo })` → `finally { load() }`. `onUndo` re-runs the inverse call then
   `resync()`, and on its own failure re-syncs + shows "list reloaded" (never the
   generic field error) so a failed undo can't strand the optimistic state.
6. **Row flash**: `flashId` state + self-clearing `flash(id)`; `sn-row-flash`
   (tokens.css) fades a brief tint on the row that just moved / restored so the
   eye finds it after the tree re-sorts.
7. **Optimistic list mutation** (`applyMoveLocally` + `applyMove`): a pure
   `(items, move) → items` function applies the change to local state on the
   interaction; keep the pre-change array as `snapshot`, `setItems(snapshot)` on
   failure, and let the `finally { load() }` refetch reconcile either way.
8. **Auto-tooltip on collapsed labels** (`ActionButton`): a `matchMedia` hook
   detects when the viewport is below the `collapseLabel` breakpoint and sets
   `title` to the label text — a hover tooltip appears only while the button is
   icon-only, never when the text shows.
9. **treegrid aria threading**: `buildForest` → `walk` carries `posInSet` /
   `setSize` / `orphan` per node into the row props; the row spreads
   `aria-level` / `aria-setsize` / `aria-posinset` / `aria-expanded` only when
   `tree` metadata is present (the flat table passes none).
10. **Sanitise-in-place inputs** (`slugify` / `slugifyLive` / `collapseWs`):
    capture `register('field')` once, then in a wrapping `onChange` / `onBlur`
    rewrite `e.currentTarget.value` and call `field.onChange(e)` — RHF reads the
    cleaned value, so a paste of `"xzcx zxzxcv"` can't sit in the slug field
    until submit. Slug live-slugifies (blur trims a dangling `-`); the name
    collapses whitespace / pasted newlines on blur. CODING-RULES H4.

---

## Corner cases & decisions (the log)

| #   | Symptom                                                                                | Resolution                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Undo of a drag did nothing until a page reload.                                        | `reactStrictMode` dev-mounts **mount → cleanup → mount**; the `mounted` ref was set `false` only in the effect cleanup, so it stuck `false` and `resync()` short-circuited forever. **Set the flag in the effect body too.** (CODING-RULES H7.)                                                                  |
| 2   | A stale GET could overwrite a fresher one.                                             | `loadSeq` monotonic id in `load()`; only the latest `setItems` wins.                                                                                                                                                                                                                                             |
| 3   | Browser could serve a stale `GET /categories` from HTTP cache right after a mutation.  | `adminApi` sends `cache: 'no-store'` on every call.                                                                                                                                                                                                                                                              |
| 4   | `/reorder` with an id that's since been deleted / archived → 422.                      | Treat `VALIDATION_ERROR` from reorder as "the tree changed" → `notify.info('reloadedAfterChange')` + `load()`, **not** the generic "check the fields" copy. Same branch for a failed undo.                                                                                                                       |
| 5   | Drop _inside_ a collapsed parent → the moved row lands out of sight.                   | `onDrop` calls one-way `expand(target.id)` before `onReorder`.                                                                                                                                                                                                                                                   |
| 6   | Two rapid drops race on the server.                                                    | `reordering.current` ref gates one `/reorder` in flight; a drop that lands while it's busy is queued instead of dropped — see row 23.                                                                                                                                                                            |
| 7   | Tree connector lines clipped / not meeting across the row border.                      | Connectors are an absolutely-positioned `TreeGuides` layer filling the whole `<td>` (`top/bottom: -1` bridges the 1px border), not flex children.                                                                                                                                                                |
| 8   | Delete asymmetry.                                                                      | `remove` **blocks** on live children (`CATEGORY_HAS_CHILDREN`); `restore` **cascades** the archived subtree. By design — deleting a subtree is N bottom-up clicks.                                                                                                                                               |
| 9   | Sonner `<li>` wrapper painted a border ring around custom toasts.                      | Per-toast `style` reset (`BARE`) in `toast.tsx`.                                                                                                                                                                                                                                                                 |
| 10  | Undo toast clipped on narrow screens — the Undo button ran off-screen below ~383 px.   | `toast.custom` content isn't width-managed by sonner (only its built-in toasts shrink < 600 px). Our `SavedToast` / `UndoToast` boxes are now `w-[min(356px,100vw-2rem)]`.                                                                                                                                       |
| 11  | `sticky` table header scrolled away with the page.                                     | `Table`'s `overflow-x-auto` wrapper is also a _vertical_ scroll container (CSS coerces `overflow-y` to `auto`), so `sticky top-0` pinned to that non-scrolling box. `Table scrollX={false}` → `overflow-clip` (both axes; not a scroll container); the tree tables use it since they're `table-fixed`.           |
| 12  | Undo of a bottom→top move didn't scroll back to the restored row (top→bottom did).     | Browser scroll-anchoring only follows a re-sorted row in one direction. `scrollIntoView({ block: 'nearest' })` on the flashed row (keyed on `[flashId, items]` so it re-runs after the reload); rows carry `scroll-my-24` so they don't land flush to the viewport edge. (`34d0bcf`)                             |
| 13  | Optimistic drag could leave a corrupted tree if `/reorder` failed.                     | `applyMove` keeps the pre-drop `snapshot`; `catch` does `setItems(snapshot)` and `finally { load() }` refetches. Reparent also re-roots the moved subtree's `path`/`depth` locally so `buildForest` nests it correctly before the server confirms. (`ceeb129`)                                                   |
| 14  | Native drag freezes page scroll — a tall tree couldn't reach off-screen drop targets.  | `onDragOver` runs `edgeAutoScroll`: a rAF loop nudges the nearest scrollable ancestor when the pointer is within 64 px of its top/bottom; cleared on drop/dragend/unmount. (`34d0bcf`)                                                                                                                           |
| 15  | A child whose parent isn't in the list was silently rendered as a root.                | `buildForest` marks it `orphan`; the row shows a `warning`-tone **"detached"** badge with a title. Still rendered (no data hidden), just no longer lying about the hierarchy. (`f29ac7b`)                                                                                                                        |
| 16  | Restoring a child whose parent is still archived → 409 only after the click.           | `parentArchived(c)` pre-disables the Restore action (row button + edit-modal button) with a "restore the parent first" tooltip on a wrapper span (a disabled `<button>` eats hover). Desktop archived rows also gained a read-only **View** so they aren't Restore-only. (`d5eb3ce`)                             |
| 17  | Stale edit form silently overwrote a newer edit.                                       | `updateCategory` sends `expectedUpdatedAt`; API → `409 CONFLICT` on mismatch. Modal closes, refetches, 5 s toast — reopen for a fresh token. Integration-tested. (`1113a8f`)                                                                                                                                     |
| 18  | Action icons clipped at the table's right edge; table top corners had no border.       | Actions `<td>` was `w-20` but `TableCell`'s `px-3` left ~56 px for ~84 px of icons → overflow, cut by the clip wrapper. `w-28`/`px-2`. And `overflow-x-clip` clips only the X axis, so `rounded-[inherit]` corners weren't honoured — the opaque sticky `<thead>` showed through. → `overflow-clip`. (`7931322`) |
| 19  | Icon-only buttons had no hover hint; topbar icon buttons had `aria-label` only.        | `ActionButton` auto-`title`s from the label text while collapsed (breakpoint via `matchMedia`); topbar's always-icon buttons got an explicit `title`. (`7931322`)                                                                                                                                                |
| 20  | Error toast background (`bg-destructive/10`) was see-through over page text.           | No `--destructive-muted` token existed (success/warning had theirs). Added it (light + dark), wired `destructive.muted` into the tailwind preset, switched the error tone to `bg-destructive-muted`. (`949c36f`)                                                                                                 |
| 21  | Toast family was inconsistent — `saved`/`undo` had a timer bar, `error`/`info` didn't. | One tone-driven `BarToast`; every `notify.*` gets the bar and the responsive width. `error`/`info` gained an `ms` arg. CODING-RULES G9. (`949c36f`)                                                                                                                                                              |
| 22  | Row-hover "+ Add child" was easy to miss (appeared only on hover, far right).          | Fades + slides 4 px into place on hover / focus (150 ms) so the motion draws the eye; hidden at rest, `lg+` only, no layout shift. (`7b419ab`) Options A (faint-at-rest) and B (permanent in the cluster) were weighed and passed.                                                                               |
| 23  | A drop during an in-flight `/reorder` was silently swallowed (was #6's trade-off).     | `pendingMove` ref holds the newest such drop (latest wins), stacked onto the optimistic tree + flashed for feedback; the in-flight call's `finally` runs it next. Skipped if the in-flight call **failed** — a move built on a failed reorder would apply against the wrong tree; `load()` shows real state.     |
| 24  | A slug could be `login` / `cart` / `api` / `c` — shadowing a storefront route.         | `slugSchema` (contracts) `.refine`s against `RESERVED_SLUGS` / `isReservedSlug`, so every catalog entity's slug is checked both sides; the admin form mirrors it with `categories.form.err.slugReserved`. Exact match after lower-casing — `new-arrivals` is fine. plan/07 "Catalog naming / uniqueness".        |

---

## Deferred / backlog

The v1 backlog (optimistic drag, edge auto-scroll, orphan flag, treegrid a11y,
pre-disable Restore, concurrent-edit token, sticky header, expand-all,
child-count chips, row-hover "+", `/`-search, rapid-second-drop queue) all
shipped 2026-09-07/09 — see corner-case log rows 12–23.

**Declined (with reason)**

- **Position field → "Advanced" disclosure.** Drafted and reverted. Drag is the
  normal way to order now, but the modal's Position field is the _only_ reorder
  path on touch (`< md`, no drag). Collapsing it there is a net loss. Revisit
  only if the collapse is gated to `pointer: fine`.

**Still open**

- **Optimistic-drag rollback coverage** — the snapshot restore isn't exercised on
  every failure path (only `VALIDATION_ERROR` is manually verified). Add a test
  that forces a 500 / network error mid-drag. The queued-drop path (row 23) is
  likewise unit-untested — `applyMoveLocally` is pure and idempotent, so it's a
  cheap one to add when the admin gets a test setup.
- **No bulk actions** — multi-select rows → archive / move many. Needs a
  selection model the CRUD kit doesn't have yet.
- **Tree has no first-class keyboard reorder** — only via the Edit form (WCAG
  2.5.7 satisfied). A roving-tabindex + arrow/space reorder on the treegrid is
  the full fix.
- **Search is out-of-context** — token match returns a flat list; it doesn't
  highlight or expand-to the matching row _in the tree_.
- **No virtualization** — `buildForest` + a full re-render on every change is
  fine to ~1000s of rows, not beyond.
- **Time-related UI pass** (project-wide, _after_ feature work) — a dedicated
  sweep of every waiting/loading/optimistic state (list fetch, create/update
  spinners, drag reconcile, reorder queue, 409 flow) driven by a dev-only
  latency-injection flag on the API: `DEV_RESPONSE_DELAY_MS` env +
  `x-debug-delay: <ms>` header + route glob, same shape as `DEV_AUTH_RELAXED`.
  DevTools network throttling stays the tool for asset / cold-load states.

---

## Extract into the CRUD kit when Brands lands

Brands is the second entity — the moment to promote what's proven here:

- `CategoryCards` → generic `ResourceCardList` (label + sub-line + action slot).
- Edit-modal-owns-destructive-actions → `FormModal` `secondaryAction` convention
  (already a prop; document it).
- Per-column responsive priority → `ResourceListPage` `hideBelow` config
  (CODING-RULES G7 point 3), replacing hand-rolled `hidden lg:table-cell`.
- Combined zod + client-check resolver → a `useCrudResolver(schema, checks)`
  helper.
- `notify.undo` + `resync` + `reorderErrorToast` → a `useUndoableMutation` hook.
- Slug `register` + `slugifyLive`/`slugify` on change/blur → a `<SlugInput>`
  primitive (Brands has a slug field too).

Brands also needs its own API work: brand→products delete guard, a brand
`restore` endpoint (parity with categories).
