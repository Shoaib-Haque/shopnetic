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

| File                      | What                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`                  | thin `adminApi` wrappers — `listCategories`, `createCategory`, `updateCategory`, `reorderCategories`, `deleteCategory`, `restoreCategory`         |
| `category-list.tsx`       | page container: fetch + status filter + search, drag→`applyMove`, delete→undo, modal wiring, desktop/mobile switch                                |
| `category-tree.tsx`       | `CategoryTree` (nested + drag), `CategoryFlatTable` (search / archived), `CategoryCards` (mobile), `buildForest`, `TreeGuides`, `useAncestorPath` |
| `category-form-modal.tsx` | create / edit / view(archived) modal; combined resolver; slug auto-fill                                                                           |
| `../error-copy.ts`        | API error `code` → `catalog.errors.*` key                                                                                                         |

---

## Behaviour (implementation notes)

- **Ordering.** `GET /admin/v1/categories` returns rows sorted by the ltree
  `path` (uuid labels), so sibling order is **not** meaningful until the client
  re-sorts. `buildForest` links `parentId`, then sorts each level by
  `position` then name. The `/reorder` service re-sorts its own return the same
  way. A parent missing from the result (archived while a child stays active)
  makes the child a **silent root** — see backlog.
- **Drag zones.** `onDragOver` splits the row: top 30 % = _before_, bottom 30 % =
  _after_, middle = _inside_ (nest). One `POST /admin/v1/categories/reorder`
  `{ parentId, orderedIds }` per drop; ids whose parent changes are reparented
  (ltree path rewrite + cycle check) server-side. Whole row is the drag target
  on desktop; drag is off below `md` (CODING-RULES G8).
- **Undo, not confirm** (CODING-RULES G8). Reorder / reparent / delete apply
  immediately + a 20 s `notify.undo`. Restore keeps a confirm — it names the
  un-archive cascade. `CategoryMove.undoOrderedIds` is the `fromParent`'s child
  order snapshotted at drop time; undo is just another `/reorder` with it.
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

---

## Corner cases & decisions (the log)

| #   | Symptom                                                                               | Resolution                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Undo of a drag did nothing until a page reload.                                       | `reactStrictMode` dev-mounts **mount → cleanup → mount**; the `mounted` ref was set `false` only in the effect cleanup, so it stuck `false` and `resync()` short-circuited forever. **Set the flag in the effect body too.** (CODING-RULES H7.) |
| 2   | A stale GET could overwrite a fresher one.                                            | `loadSeq` monotonic id in `load()`; only the latest `setItems` wins.                                                                                                                                                                            |
| 3   | Browser could serve a stale `GET /categories` from HTTP cache right after a mutation. | `adminApi` sends `cache: 'no-store'` on every call.                                                                                                                                                                                             |
| 4   | `/reorder` with an id that's since been deleted / archived → 422.                     | Treat `VALIDATION_ERROR` from reorder as "the tree changed" → `notify.info('reloadedAfterChange')` + `load()`, **not** the generic "check the fields" copy. Same branch for a failed undo.                                                      |
| 5   | Drop _inside_ a collapsed parent → the moved row lands out of sight.                  | `onDrop` calls one-way `expand(target.id)` before `onReorder`.                                                                                                                                                                                  |
| 6   | Two rapid drops race on the server.                                                   | `reordering.current` ref gates one `/reorder` in flight. (Trade-off: the 2nd drop is silently dropped — see backlog.)                                                                                                                           |
| 7   | Tree connector lines clipped / not meeting across the row border.                     | Connectors are an absolutely-positioned `TreeGuides` layer filling the whole `<td>` (`top/bottom: -1` bridges the 1px border), not flex children.                                                                                               |
| 8   | Delete asymmetry.                                                                     | `remove` **blocks** on live children (`CATEGORY_HAS_CHILDREN`); `restore` **cascades** the archived subtree. By design — deleting a subtree is N bottom-up clicks.                                                                              |
| 9   | Sonner `<li>` wrapper painted a border ring around custom toasts.                     | Per-toast `style` reset (`BARE`) in `toast.tsx`.                                                                                                                                                                                                |
| 10  | Undo toast clipped on narrow screens — the Undo button ran off-screen below ~383 px.  | `toast.custom` content isn't width-managed by sonner (only its built-in toasts shrink < 600 px). Our `SavedToast` / `UndoToast` boxes are now `w-[min(356px,100vw-2rem)]`.                                                                      |

---

## Deferred / backlog

Not lost — parked with reason. Pick up when the cost/benefit flips or a later
page needs it.

- **Optimistic drag** — today the row doesn't visibly move until mutate + refetch
  (~600 ms). Move it in local state on drop, reconcile on response, roll back on
  error (CODING-RULES E2). Own commit.
- **Edge auto-scroll while dragging** — HTML5 DnD won't scroll the window; a long
  tree can't drag bottom→top. Own commit.
- **Silent second drop** (#6) — queue it or show a "one moment" toast instead of
  dropping it.
- **Orphan row** — `buildForest` roots a child whose parent isn't in `items`;
  `console.warn` + a subtle marker so the UI doesn't lie.
- **`role="tree"` / `aria-expanded` / `aria-level`** — the desktop tree is a
  plain `<table>`. Keyboard reorder is covered by the Edit form (WCAG 2.5.7) but
  the tree itself isn't announced as one.
- **Pre-disable Restore** when the target's parent is still archived (the API
  rejects it; we only find out on click).
- **Position field** in the Edit modal is near-vestigial next to drag — consider
  hiding it under an "Advanced" disclosure.
- **Concurrent edit** — no optimistic-concurrency token on `updateCategory`;
  last write wins silently. Fine for categories (low churn); revisit for
  higher-traffic entities.
- **Sticky table header**, **expand-all / collapse-to-roots**, **child-count on
  collapsed parents**, **row-hover "+ Add child"**, **`/` focuses search** —
  nice-to-haves.

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

Brands also needs its own API work: brand→products delete guard, a brand
`restore` endpoint (parity with categories).
