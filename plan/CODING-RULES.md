# Coding Rules

Status: LOCKED (changes require team agreement + a note in the Changelog below)
Applies to: every app and package in the monorepo.
Related: `09-frontend-architecture.md`, `10-seo-strategy.md`, `16-security.md`,
`19-testing-strategy.md`, `08-api-design.md`

This is the contract for *how* we write code on Shopnetic. It is short on purpose.
If a rule and reality conflict, raise it — don't silently ignore it.

---

## A. Process / working agreement

### A1. Ask before you build
Before starting any new feature or non-trivial change, if **anything** is
ambiguous — requirements, edge cases, which existing code to touch, UX,
data shape, naming — **ask first**. A 2-minute question beats a 2-day rebuild.
List your assumptions explicitly and get them confirmed.

### A2. Think the whole flow through before writing code
For every feature (new or altered), write down *before coding*:
- The happy path, step by step, end to end.
- Every **error case** and what the user sees for each.
- Every **corner case** (empty, zero, max, concurrent, slow network, partial
  failure, permission denied, stale data, double submit, back button).
- **Every place that must change** for the full flow to work: DB schema +
  migration, API contract (`@shopnetic/contracts`), service logic, events,
  BFF, frontend, cache invalidation, notifications, admin visibility, tests,
  docs. Nothing downstream should break.

Put this in the PR description. If the list is large, split the PR.

### A3. One change, one purpose
A PR does one thing. No drive-by refactors mixed with features. Refactors get
their own PR so review and rollback stay clean.

### A4. Leave it working
Never merge something that breaks an existing flow. If a change needs a
follow-up to be complete, guard it behind a feature flag (`disabled` by default)
so `main` is always shippable.

### A5. Definition of done
Code + tests (right layer, see `19`) + types clean + lint clean + error/loading/
empty states handled + docs/plan updated + dashboards/alerts if it's a service +
admin can see/moderate it if it's user-facing + PR checklist (section K) ticked.

---

## B. TypeScript

### B1. No `any`. Ever.
`any` disables type checking and *does* cause real bugs. Use:
- `unknown` + a type guard / Zod parse for genuinely unknown input.
- Proper generics for reusable code.
- `as const`, discriminated unions, and exact object types for domain data.
- If you truly must escape the type system, it's `// @ts-expect-error <reason
  + ticket>` on a single line, reviewed, never `any`.

`@typescript-eslint/no-explicit-any` is an **error**, not a warning.

### B2. `strict` everywhere
`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes:
true`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. No per-file opt-outs.

### B3. Types come from one source
Domain / API types are generated from Zod schemas in `@shopnetic/contracts`.
Do **not** hand-write a second copy of an API type in the frontend. Import it.

### B4. Parse at the boundary, trust inside
Every external input (HTTP body, query, params, env vars, message payload,
3rd-party response, `localStorage`) is validated with Zod **at the edge**.
After that boundary the data is typed and trusted — no defensive `?.` soup deep
in the code.

### B5. No type assertions to force a fit
Avoid `as SomeType` except for `as const` and narrowing after a checked guard.
`x as unknown as Y` is banned. If the types don't line up, fix the types.

### B6. Nullish handling is explicit
Use `??` and optional chaining deliberately. Model "no value" as `T | null`
(DB/domain) consistently; don't mix `null` and `undefined` for the same concept.

---

## C. Next.js, Server Components & SEO

> Rationale: we render on the server so crawlers get full HTML and users get
> fast first paint. Marking a high-level file `'use client'` opts its **whole
> subtree** into client rendering and kills that benefit. See `10-seo-strategy.md`.

### C1. `'use client'` only at the leaves
**Never** put `'use client'` in:
- `layout.tsx`, `template.tsx`, `page.tsx`
- providers, context wrappers
- section/container components that render lots of content
- anything that outputs indexable text (product info, descriptions, prices,
  breadcrumbs, reviews)

**Only** put it in small, focused interactive units: a button, a form field, a
menu toggle, an add-to-cart control, a carousel, a quantity stepper. Push the
`'use client'` boundary **as far down the tree as possible**.

### C2. Compose: server shell + client islands
Server Components fetch data and render structure; they pass data as props into
small client components for interactivity. Client components receive
server-rendered `children` where possible (children render on the server even
inside a client parent).

```
// GOOD: page is a Server Component; only the control is client
app/(marketing)/p/[slug]/page.tsx        -> Server Component, fetch + render + JSON-LD
components/product/AddToCartButton.tsx    -> 'use client', tiny
components/ui/Button.tsx                  -> our wrapper (see D)
```

```
// BAD
app/(marketing)/p/[slug]/page.tsx  -> 'use client'   // whole PDP now client-rendered
```

### C3. Data fetching stays on the server
Fetch in Server Components / route handlers / server actions. No fetching primary
content in client `useEffect`. Client data fetching (TanStack Query) is only for
post-load interactive data (cart mutations, live updates, infinite lists behind
a crawlable fallback).

### C4. Every indexable page sets metadata
`generateMetadata` (title, description, canonical, OG), correct `robots`, and
JSON-LD per `10-seo-strategy.md`. CI guards this — don't fight the guard, fix the
page.

### C5. No layout shift, no client-only content on money pages
Reserve space for images/media. Primary content of PDP/category/home is in the
server HTML.

### C6. Server/client boundary is intentional
If you're about to add `'use client'` to make an import work, stop and refactor:
extract the interactive bit into its own leaf component instead.

---

## D. Component architecture & reuse

### D1. Wrapper layer over shadcn
Every shadcn primitive gets a thin project wrapper in `@shopnetic/ui`
(`Button`, `Link`, `Input`, `Dialog`, ...). App code imports **our** wrapper,
never shadcn/Radix directly. The wrapper is where we centralize:
- theme tokens, sizes, variants (via CVA)
- the `'use client'` boundary (so pages stay server components)
- built-in behavior: `Button` handles `loading` (spinner + `disabled` +
  `aria-busy`), `Link` handles pending navigation state, inputs handle error
  display.

### D2. Reuse before you write
Before creating a component/util/hook, search the repo. Extend or generalize
what exists. Duplicated logic (same thing in 2+ places) must be lifted into a
shared module. Copy-paste is a review blocker.

### D3. One way to do a common thing
Money formatting, dates, addresses, ratings, price display, empty states,
error banners, page headers, data tables, pagination, **password fields**
(`@shopnetic/ui` `PasswordInput` — has the show/hide toggle), **search fields**
(`@shopnetic/ui` `SearchInput` — magnifier + clear button with tooltip, `Esc`
to clear, `onClear` for a re-fetch), **one-time codes** (`@shopnetic/ui`
`OtpInput` — segmented `0-9`-only cells, auto-advance, paste-to-spread,
`onComplete` for auto-submit; a non-6-digit fallback like a recovery code
uses a plain `Input`), **scannable secrets** (`@shopnetic/ui` `QrCode` —
client-side PNG data URI via `qrcode`, nothing sent anywhere to generate it;
a `<Skeleton>` fills the frame while it encodes) — **one** shared component
each. No local reinventions.

### D4. Components are dumb about data source
A component takes props; it doesn't know about `fetch`, the BFF, or the store.
Container/server components wire data in. Keeps them testable and reusable.

### D5. Keep components small
If a component file is doing data shaping + layout + 3 interactions + business
rules, split it. Rule of thumb: one component = one responsibility, one screen of
code.

### D6. Naming & structure
- Components `PascalCase`; hooks `useX`; utils `camelCase`; constants
  `SCREAMING_SNAKE`.
- Colocate `Component.tsx` + `Component.test.tsx` + `Component.stories.tsx`.
- No deep relative imports (`../../../`); use workspace aliases.
- Barrel files only at package boundaries, not inside features (avoids circular
  imports + bloated bundles).

---

## E. UX feedback (loading / disabled / pending)

### E1. Every async action shows its state
On click/submit of anything that hits the network:
- disable the trigger (button/link) so it can't be double-fired
- show a spinner or inline pending indicator
- keep the label meaningful ("Placing order…" not just a spinner with no context)
- re-enable and restore on completion (success **or** error)

Our `Button`/`Link` wrappers (D1) do this via a `loading` prop — use it, don't
hand-roll.

### E2. Optimistic UI must roll back visibly
If you update the UI before the server confirms (cart qty, wishlist), on failure
revert the UI **and** show an error toast explaining what happened.

### E3. Prevent double submit at every layer
Disabled button (UX) **and** idempotency key on the request (correctness, see
`08` section 6). Never rely on the disabled button alone.

### E4. Skeletons for first load, spinners for actions
Route/section first load → skeleton matching final layout (no CLS).
User-triggered action → spinner on the control. Don't blank the whole screen for
a background refetch.

Changing a **filter, tab, or segment** that swaps the dataset (a list's
Active/Archived/All tabs, a different date range) is a *new first load* — clear
the old rows and show the skeleton, don't leave the previous selection's rows
frozen on screen with no feedback while the new set loads. Only a *same-dataset*
background refresh (a post-mutation resync, a poll) keeps the current rows
visible. Verify the difference under real latency with `DEV_RESPONSE_DELAY_MS`
(section R4).

### E5. Empty, error, and partial states are required
Every list/section ships all four: loading, empty (with a helpful next step),
error (with retry), and partial (some data failed — show the rest + a notice).
A PR adding a data view without these is incomplete.

The error state renders **instead of** the empty state, never stacked on it
(a failed fetch that left the collection at `[]` must not show both "something
went wrong" and "nothing here yet"). "With retry" for a whole-page/whole-section
view can be a page reload — an in-page Retry button is welcome but not required,
and a back-office team may choose a plain message + reload over button chrome.

---

## F. Error handling & user-facing messages

### F1. Two audiences, two messages
- **User**: plain-language, actionable, no codes, no stack, no jargon.
  "We couldn't reach your saved addresses. Try again in a moment." + retry.
- **Logs/Sentry**: full detail — error, `correlationId`, inputs (PII-redacted),
  stack. The user message carries the `correlationId` in small print so support
  can link them.

### F2. Never leak internals to the UI
No raw exception text, no SQL, no service names, no `undefined is not a
function`, no HTTP 500 body. The frontend maps error `code`s (from the API error
envelope, `08` section 4) to friendly copy via one shared mapper.

### F3. Handle the failure where you can do something about it
Catch to add context, retry, compensate, or convert to a user message — not to
swallow. `catch {}` with no handling is banned. Let it bubble to an error
boundary if the local code genuinely can't recover.

### F4. Error boundaries at sensible seams
`error.tsx` per route segment + `global-error.tsx`. A widget failing (reviews,
recommendations) must not take down the page — wrap it in its own boundary with a
local fallback.

### F5. Distinguish error types
not-found (404 page), unauthorized (redirect to login, keep `returnTo`),
forbidden (explain, don't loop), validation (field-level messages), conflict
(explain what changed, offer reload), rate-limited (say "try again in X"),
network/offline (retry banner), server (generic + correlationId). Don't collapse
them into one "Something went wrong".

The distinctions that must survive are the ones where **handling** or the
user's **remedy** differs: 401 → login, 403 → explain, 404 → "it's gone",
409 → conflict + reload, validation → field errors, offline → "check your
connection". Pure server/transport failures with the same remedy — 500 / 502 /
503 / 504 / 429 / a malformed body — *may* share one generic "try again" line
if a per-code message wouldn't change what the user does; a surface owner (e.g.
a back-office list) can take that trade. Offline still gets its own line even
then, because "check your connection" ≠ "retry".

### F6. Money/stock/permission checks are server-side, always
Client-side checks are UX hints. The server re-validates price, stock, coupons,
totals, and authorization on every mutation (see `12`, `16`). Never trust a
client-sent price or permission.

### F7. Validation messages are specific
"Enter a valid email" not "Invalid input". "Quantity can't exceed 5 for this
item" not "Error". Reuse the Zod schema's messages between client and server.

### F8. Undo / retry handlers own their own failure
An `onUndo` (or a retry, or an optimistic rollback) can itself fail because the
world moved on — the row it wanted to restore is gone, the parent got archived.
When it does: **re-sync from the server** and show a "the list changed —
reloaded" message, *not* the generic field-validation copy (F5 conflict, not
validation) and *not* nothing. Never leave the optimistic/pre-undo state on
screen after the undo failed. Pairs with G8; worked example in
`apps/admin/src/features/catalog/categories/README.md` (log #4).

---

## G. Design system consistency

### G1. Tokens only — no magic values
Colors, spacing, radii, font sizes, shadows, breakpoints, z-index come from the
shared token set (`@shopnetic/ui`, Tailwind preset). No hex codes, no arbitrary
`p-[13px]`, no one-off font sizes in feature code.

### G2. One visual language across buyer + seller + admin
Same tokens, same components, same interaction patterns everywhere. **Admin/
seller** = denser spacing preset + more utilitarian layout, but identical
colors, typography scale, component behavior, and iconography. It should feel
like the same product.

### G3. Typography & spacing scale
Use the defined type scale and spacing scale. No hand-picked line-heights or
letter-spacing. Headings follow the semantic hierarchy (`h1` once per page, in
order).

### G4. Dark mode & theming via CSS variables
All colors reference CSS custom properties so theming/dark mode work everywhere.
No component hardcodes a light-mode color.

### G5. Icons, copy, and states are consistent
One icon set. Shared copy patterns (button verbs, empty-state tone, error tone).
Loading/disabled/hover/focus styling comes from the wrapper components, not
per-feature CSS.

### G6. Accessibility is part of "consistent"
Every interactive element: keyboard reachable, visible focus ring (token-based),
correct role/label, `aria-busy`/`aria-live` where state changes. Target WCAG 2.2
AA (`20` section 7). Color is never the only signal.

### G7. Truncation depends on where the text is shown
User-authored free text (names, titles, descriptions) can be long. How it renders
depends on the context, not the field:

- **Width-bounded / dense** — table cells, list rows, toasts, `<select>` option
  labels, chips, breadcrumbs, sidebar entries, menu items: clamp to the available
  width. `truncate` (one line) by default; `line-clamp-2` where two lines read
  better (toasts). Always expose the full value another way — `title=` on the
  element, or the detail view it links to. A table column that can hold long free
  text uses `table-fixed` so one cell can never push the others off-screen.
- **Primary display** — storefront PDP title, an admin *detail* page header, the
  heading of the modal editing that record: show the whole value, wrap to as many
  lines as it needs.
- **Never truncate** — slugs, SKUs, codes, IDs shown so the user can read/copy
  them (let them wrap or scroll instead); money, dates, counts, status.
- **Native `<select>`**: also cap the option label strings themselves (~64 chars
  + `…`) — the open dropdown's width is not CSS-controllable.
- **Interpolated into a fixed-width dialog** (a confirm message, a toast) —
  cap the value *before* it's embedded in the sentence (~60 chars + `…`), not
  after. A confirm dialog is deliberately a fixed, reasonable width (`sm`); an
  unbounded name wraps that into a wall of text instead of growing the width.
  The full value is still one hover/click away — the row's `title=`, the Edit
  form.
- **Data tables — responsive by priority**: never let fixed column widths sum
  past the viewport (that collapses the flexible column to nothing). Instead:
  1. Below the table's card breakpoint (admin lists default `md`), render one
     card per record — label (truncated) + secondary fields on a muted sub-line
     + one primary action; the rest live in the record's Edit form.
  2. In the band between that and `lg`, keep the table but shed its
     lowest-priority columns (`hidden lg:table-cell`) and collapse row-action
     labels to icons, so the label column keeps its width.
  3. At `lg`+, the full table.
  Each list owns its column priority order and which breakpoint each column
  drops at — a per-column `hideBelow` in the (future) `ResourceListPage` config;
  hand-rolled with `hidden …:table-cell` until the kit exists.

### G8. Reversible-by-undo, not guarded-by-confirm
For actions that are **cheap to reverse** (drag-reorder, drag-reparent,
soft-delete / archive, and the like), skip the confirm dialog — apply
immediately and show an **Undo toast** (`notify.undo`): message + Undo button +
a ~20s shrinking timer bar, Gmail-style. Only the *latest* action is
one-click-undoable — a fixed toast id means each new one replaces the previous
and restarts a full window; older items are still recoverable the long way
(Archived tab, re-order). Undo success shows its own confirmation toast.

Keep a real **confirm** only when the dialog carries information the user needs
*before* acting (e.g. "restore also un-archives N sub-categories") or the action
is genuinely destructive (hard purge). A hard *block* (e.g. "can't delete —
move its children first") is an error, not a confirm.

Drag-reorder is offered **only where order is a real, user-owned property**
(category tree, option values, media) — never on lists that are just sorted
views (brands, products). On desktop the whole row is the drag target; below
`md` drag is off entirely (touch-drag on a tree is a poor UX) and the record's
Edit form is the reorder/reparent path — which also satisfies WCAG 2.5.7.
Row actions that only exist on desktop (Delete, Restore) must also be reachable
from that Edit form so mobile isn't a dead end.

### G9. One toast shape; duration tracks importance
Every `notify.*` renders the same `BarToast` box — tone (`success` / `error` /
`info`) sets the icon and colours, and **all of them carry a shrinking timer
bar**. `notify.undo` is the dark variant with the Undo button (G8). Don't reach
for sonner's built-in `toast.*` directly.

Duration = time to read **plus** time to act when the toast asks for something:

- Plain confirmation ("Category saved.") → `DEFAULT_MS` (3s). Never shorter.
- The toast carries an instruction, or the user just lost context (a conflict
  that closed their modal) → bump via the `ms` arg, ~5s.
- A real action window (`notify.undo`) → ~20s.

Don't stretch routine confirmations. The bar is a plain CSS animation, so it
keeps draining while sonner pauses the real dismiss timer on hover / when the
tab is hidden — treat it as indicative, not exact.

### G10. A control looks like what it does; a message matches the current state
**Outline / border, or not** — decide by how the control sits, not by habit:
- A **standalone text-only action** with no other visual cue that it's
  interactive (e.g. a "Collapse all" toggle floating next to a bordered
  filter-pill group) needs a visible border (`ActionButton variant="outline"`)
  — otherwise it reads as a label, not a control.
- **Icon-only controls in a dense/repeated context** (a row's Edit/Delete/
  Restore icons, the sidebar collapse toggle, a topbar icon button) don't —
  the icon plus a hover background is enough affordance there, and a border on
  every row action is just noise.
- A **segmented group** (status filter pills) reads as one control because the
  *group* has a border and the active pill gets a fill — the bare pills inside
  it don't each need their own border.
- Primary/secondary form actions (Save, Cancel, a destructive confirm) already
  get full `Button` styling — unchanged.

**Every icon-only control gets a hover tooltip on PC — an `aria-label` alone
only reaches a screen reader, not a mouse user.** Use `Tooltip`/
`TooltipTrigger`/`TooltipContent` (`@shopnetic/ui`, `TooltipProvider` already
wraps the whole app in `AdminShell`) — a real, `.sn-popover`-styled tooltip
with a consistent ~300ms hover delay (instant on focus, so keyboard users
aren't held up), not a bare `title=` attribute (browser-default styling,
inconsistent delay/behavior across browsers, can't be a token color).
Older code (`category-list.tsx`, `category-tree.tsx`, three of `topbar.tsx`'s
own buttons) still uses `title=` — it works, not a bug, just the older
convention; migrate opportunistically when touching that component, `Tooltip`
is what new icon-only controls reach for. Same tooltip text as the
`aria-label` (reuse the same translation key) — don't maintain two copies of
the same hint.

**A tooltip / label that names two opposite states never shows a fixed string
for both** — "Collapse or expand sidebar" is true regardless of which one a
click will actually do. Read the *current* state and say what the click will
do this time ("Collapse sidebar" ⇄ "Expand sidebar"), the same way the tree's
expand/collapse chevron already keys its `aria-label` off `tree.collapsed`.
Applies everywhere a message describes a toggleable thing, not just tooltips.

**Scrollbars are slim and consistent everywhere**, not just where someone
happened to add `overflow-auto`: a global, token-colored, theme-aware
`::-webkit-scrollbar` / `scrollbar-color` rule (`packages/ui/src/tokens.css`)
covers the page, modals, tables — anywhere something scrolls — with no classic
up/down arrow buttons. A native `<select>` popup is OS-rendered and can't be
restyled from CSS; that one's a known gap, not a missed selector.

### G11. A state change animates — it doesn't snap
Anything that shows/hides, resizes, or repositions in response to user
interaction (not initial page load) gets a transition. An instant show/hide
reads as broken or laggy even when it's working correctly; a smooth one reads
as responsive. This was already true for the parts of the app that had it —
the desktop sidebar's collapse (`transition-[width]`), the mobile drawer's
open/close (`transition-transform` + `transition-opacity`) — the rule is to
apply it *everywhere* this shape shows up, not just where someone happened to
reach for it.

**Any disclosure-style trigger** — a sidebar/nav group, a dropdown, a drawer,
an accordion, a future `Select`-style control, anything that opens/closes a
region of UI — gets *both* pieces together, not just the transition:
1. **The content transitions** (technique below).
2. **If the trigger has a directional icon** (a chevron is the common case),
   **it rotates/flips with the open state** — `group` +
   `group-data-[state=open]:rotate-180` when the trigger is a Radix
   primitive (it already exposes `data-state`, no extra wiring), or the
   same `rotate-180` keyed off local `isOpen` state otherwise. Reference
   implementations: `sidebar.tsx`'s nav-group chevron (local state),
   `topbar.tsx`'s account-menu chevron (Radix `data-state`).
3. **Per G10**, if there's a label/tooltip naming the action, it names the
   *current* state's action, not a fixed string for both.
A new disclosure-style component that only does the transition and skips
the chevron/label state-matching is half-done, not just missing polish.

**Technique by what's changing:**
- **Size/position that's already a token value** (width, a translate,
  opacity) — a plain Tailwind `transition-*` + `duration-*` on the property
  that's changing. This covers most cases (sidebar width, drawer slide,
  overlay fade, a chevron's `rotate-180`).
- **Height, when the expanded size isn't a fixed value** (a disclosure's
  child list, an accordion body) — `grid-rows-[0fr]` ⇄ `grid-rows-[1fr]`
  with `transition-[grid-template-rows]` on a wrapper `div`, and
  `overflow-hidden` on the single grid child holding the real content. This
  needs no magic max-height number and handles content of any length.
  **The content must stay mounted** (no `{open && <content>}`) — an
  unmounted node has nothing to animate from/to; toggle `inert` on it
  instead of unmounting, so it's still out of tab order and hit-testing
  while collapsed. Reference implementation:
  `components/layout/sidebar.tsx`'s nav-group expand/collapse.
- **A modal/dialog/popover already on Radix** — Radix exposes
  `data-[state=open]`/`data-[state=closed]` on its content/overlay; style
  those with a fade+scale keyed off `data-state`, not the default instant
  mount/unmount. `.sn-popover` (`packages/ui/src/tokens.css`) is the
  ready-made class for this — drop it on the `className` and it just works,
  no per-component animation wiring. Reference implementation:
  `DropdownMenuContent` (`packages/ui/src/components/dropdown-menu.tsx`) —
  fixing the shared component fixed the topbar account menu *and* every
  per-row `⋮` action menu at once (G2: shared component, not four copies).

**Duration has two tiers, not one** — pick by scale, not habit:
- **Panel-scale** (sidebar collapse, drawer slide, a disclosure's
  expand/collapse — anything that reflows layout or occupies real screen
  real estate while open) — `duration-300 ease-out`. Tailwind's un-suffixed
  `transition-*` default (150ms) reads as too quick to actually perceive at
  that size, which is exactly the "very quick, make it more visible"
  feedback that bumped every one of these from 200ms.
- **Popover-scale** (a dropdown menu, a tooltip — small, click-triggered,
  expected to feel closer to instant) — `.sn-popover`'s built-in 150ms
  open / 100ms close (asymmetric on purpose: closing quicker than opening
  reads as responsive, not delayed, when dismissing). Don't apply
  panel-scale's 300ms here — it would read as sluggish for something this
  small.

Either way: everything that's part of *one* compound interaction shares its
tier's duration (the sidebar nav-group's chevron rotates in the same 300ms
its list expands in) — a part finishing early reads as desynced, not
snappy. A small, contained affordance with no attached panel/menu (a
button's hover/focus state alone) can stay at the Tailwind default —
neither tier applies until something is actually opening.

**`prefers-reduced-motion` is handled globally, not per component**: a
`@media (prefers-reduced-motion: reduce)` rule in `packages/ui/src/tokens.css`
collapses every `animation-duration`/`transition-duration` to near-zero (not
`0s`, which never fires `transitionend`/`animationend` — some code, Radix
included, waits on that event). The state change still completes correctly,
just without the interpolation. Nothing to do per component.

**Known gaps this rule surfaces, not yet fixed** — same "found via applying
a new rule, filed not silently ignored" pattern as G7's retrofit list:
Radix `Modal`/`ConfirmDialog` open/close is still an instant snap — same fix
as `DropdownMenuContent` got, drop `.sn-popover` on its content className
(panel-scale content, so worth checking whether 150ms/100ms still reads
right there or whether a modal wants the 300ms panel-scale duration
instead, not just the class copied blind); the audit-log per-row detail
expand and the category tree's row-reveal-on-expand both still pop
instantly. Fix opportunistically when touching that component, or as a
dedicated pass — not blocking on this note.

---

## H. API, data & state

### H1. Contract first
Change the Zod schema in `@shopnetic/contracts` → regenerate types/client →
update producers and consumers in the same PR. A breaking API change needs a
version bump (`08` section 2).

### H2. Follow the API conventions
Response envelope, error shape, pagination (cursor), idempotency headers, status
codes — exactly as `08-api-design.md`. No bespoke response shapes.

### H3. State lives in the right place (`09` section 4)
Server cache → RSC/TanStack Query. URL state (filters, tab, page) → `searchParams`.
Ephemeral UI → local state. No global store as a junk drawer. Never duplicate
server data into client state "to be safe".

### H4. Forms
React Hook Form + Zod resolver, schema shared with the API. Disable submit while
pending, show field errors inline, show a form-level error on failure, keep user
input on error.

**`noValidate` on every RHF form, no exceptions.** Without it the *browser's*
constraint validation (a number input's `min`, a `required` attribute) runs
first: it blocks `handleSubmit` from ever firing, shows its own bubble on only
the *first* offending field in DOM order, and leaves every other invalid field
unreported. RHF + zod must be the single source of validation UI, or the "every
field gets its own inline error" and "focus jumps to the first invalid field"
rules below silently stop being true. `FormModal` sets it once for every
current and future CRUD entity — a hand-rolled `<form>` sets it itself.

**Every field shows its own error, together, on submit** — zod's default (no
custom `mode`) already validates the whole schema at once; this only holds if
nothing native is short-circuiting it first (see above).

**Focus goes to the first field that actually violates a rule.** RHF's default
`shouldFocusError` does this correctly, but it walks fields in the order
`register()` was **called**, not JSX/visual order — those normally coincide
for `{...register('x')}` used inline, but **break the moment a field's
`register()` call is hoisted into a `const` above the JSX** (e.g. to wire a
paste-sanitizer, H4 above) in an order that no longer matches how the fields
read top-to-bottom. Don't special-case which field gets focused; keep every
hoisted `register()` call declared in the same order its field appears on
screen. Worked example / bug this caused:
`apps/admin/src/features/catalog/categories/category-form-modal.tsx` had
`slugField` declared before `nameField` while Name rendered first — focus
went to Slug even when Name was also empty.

**Normalise typed _and_ pasted input in place**, don't just reject it on submit:
identifier fields (slug, handle, code) live-transform to their valid shape on
every change (a trailing separator stays typable; tidy it on blur); free-text
fields collapse whitespace / pasted newlines on blur. Rewrite
`e.currentTarget.value` before RHF reads the event so the visible value, dirty
state and validation agree. Worked example:
`apps/admin/src/features/catalog/categories/category-form-modal.tsx`
(`slugify` / `slugifyLive` / `collapseWs`).

**A numeric field whose valid range excludes negatives blocks `-` at the key,
not just the value.** `min` on a `type="number"` input is a *submit-time*
check only — it does nothing to stop the keystroke. An `onChange`-only strip
isn't enough either: a `type="number"` input's DOM `.value` collapses to `""`
the instant what's typed isn't a fully-valid number (mid-way through `--1`,
say), so the handler can't see — or fix — what's actually on screen at that
point; the invalid text just sits there. Block the key itself
(`onKeyDown`, `e.key === '-'` → `preventDefault`), sanitize `onPaste`
separately (`selectionStart`/`End` aren't readable on a number input, so
replace the whole value rather than splicing at the cursor), and keep an
`onChange` strip as a last-resort net for anything else (drag-drop, autofill).
Worked example: the `position` field in the same file.

### H5. No business logic in components or route handlers
Domain rules live in the service/domain layer, unit-tested in isolation. The BFF
composes; components render; handlers validate + delegate.

### H6. Cache changes come with invalidation
If you add a cached read, you add its invalidation trigger in the same PR
(`14-caching-strategy.md`). TTL is a safety net, not the mechanism.

### H7. Re-fetch after a mutation, and make the re-fetch robust
Back-office pages that mutate then reload their own list must:
- **`cache: 'no-store'`** on the list GET — the data is mutable and re-read
  right after every write; the browser HTTP cache must not serve it stale.
- **A monotonic request id** guarding the state write, so a slow earlier
  `load()` can't overwrite a newer one's result (last dispatched wins).
- **A mount-safe "still active" guard.** If an `onUndo` / toast callback
  outlives the page and must not `setState` after unmount, gate it on a ref —
  but set that ref `true` **in the effect body**, not only `false` in cleanup.
  Under `reactStrictMode` (mount → cleanup → mount) and on any remount, a
  cleanup-only flag sticks at `false` and silently kills every later re-sync.
  Worked example: `apps/admin/src/features/catalog/categories/README.md` (log
  #1–#3).

### H8. A dead backend session sends the user to sign in — it doesn't sit there
The staff-plane BFF silently refreshes the access token from the refresh
cookie on a `401`; if *that* fails, the session really is gone server-side.
The already-mounted shell has no reason to re-render on its own, so a plain
inline error ("Something went wrong") leaves a fully-signed-in-looking page
sitting on top of a dead session. The shared client fetch wrapper (`adminApi`)
does a hard `window.location.assign` to the login route the moment it sees
that code — computed from the **current URL**, not an env constant that isn't
reliably inlined into the client bundle — with `?next=` so the user lands back
where they were after signing in again. Any new BFF-fronted app repeats this
at its own fetch chokepoint; it must not be re-derived per page.

### I1. Validate and authorize every request server-side
`authorize(actor, permission, resourceContext)` on every mutation + object-level
ownership check. Deny by default.

### I2. Never log secrets or PII
No tokens, passwords, card data, full addresses, KYC contents in logs/traces.
Use the redacting logger; PII fields are allow-listed, not blocked ad hoc.

### I3. No secrets in the repo, bundle, or client
Config via env + secret manager. Nothing sensitive crosses to the browser.
No service URLs or internal identifiers in client code.

### I4. Parameterized queries only
Prisma / query builder. Any `$queryRaw` needs a reviewer sign-off and bound
parameters.

### I5. Escape output; sanitize rich content
No `dangerouslySetInnerHTML` except server-sanitized CMS content through the
shared sanitizer.

---

## J. Tests, comments, commits

### J1. Test at the cheapest useful layer (`19`)
Pure logic → unit. Money/pricing/discount/saga/RBAC modules → near-100% + a
property/edge test for each invariant. Components with logic → RTL. Cross-system
money/trust journeys → a thin Playwright layer. Every bug fix ships a regression
test.

### J2. Tests assert behavior, not implementation
No snapshot-of-markup tests. Test what the user/consumer observes.

### J3. Comments explain *why*
The code says *what*. Comment the non-obvious reason, the edge case, the link to
the ADR/ticket. Delete commented-out code. No `TODO` without a ticket ref.

### J4. Conventional Commits
`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:` … scoped
(`feat(checkout): ...`). Small, reviewable commits. Green CI before merge.

### J5. Keep the plan current
If the change alters, contradicts, or completes anything documented in `plan/` —
a decision, an API contract, a data-model table, a flow, a status tag, or an
open question in `22-risks-and-open-questions.md` — update that file in the
**same PR**. A real decision also gets an ADR (`plan/adr/`). A PR whose code and
`plan/` disagree does not merge: `plan/` is the spec, and code that silently
drifts from it is a bug even when it runs. If the plan is wrong, fix the plan in
the PR — don't leave the contradiction for the next person to discover.

### J6. Keep READMEs and `.env.example` true
Every app and package has a `README.md` (what it is, how to run it, its env
vars, its layout) and every app has a `.env.example`. When a change affects any
of that — a new or renamed env var, a new script, a moved/renamed directory, a
new or changed endpoint, a different port, a new dependency a dev must install —
update the affected `README.md` **and** `.env.example` (every var documented
with a one-line comment; no real secrets) in the same PR. The root `README.md`
covers repo-wide setup and commands; keep it in step too. Stale setup docs cost
every new contributor an hour and erode trust in all the docs.

### J7. Doc notation is spelled out and legended
- Write **"section 4"**, **"section R4"** — not `§`.
- Any doc (plan file, README, long comment) that leans on shorthand symbols or
  short codes — table marks like `✅ / — / ⚠️`, cookie names (`sn_rt` …), SQL
  casts (`$1::uuid`), status tags — carries a **one-line legend at first use**
  in that file (see `03-users-and-rbac.md` top, `26` section 7). Don't make the
  reader reverse-engineer a glyph.
- Cross-references use `` `NN` section M `` (e.g. `` `16` section 4 ``) or the
  full filename; keep them clickable/greppable.

---

## L. Internationalization & copy  (see `24-i18n-localization.md`)

### L1. Zero hard-coded user-visible text
No literal string that a user can see may appear in JSX, a `throw`, a toast, a
`console`-to-UI, an email, a PDF, an `alt`, a `title`, a `placeholder`, an
`aria-label`, a button, a validation message, or an enum label. Every one comes
from a message catalog via `t('namespace.key')`. This includes **error and
validation messages** — the server returns a stable `code` + params, the client
renders `t(errorKey, params)`.

### L2. Only genuinely dynamic data is exempt
Exempt = values that originate as data: a seller's product title, a buyer's
review text, a person's name, a price number, an order id. These are rendered
as-is (or via `Intl` for numbers/dates/currency). Everything structural around
them is translated.

### L3. Keys, not English, are the identifier
`t('cart.item.removedNotice')`, not `t('This item was removed')`. Namespace per
feature (`checkout.*`, `seller.orders.*`). Interpolation and plurals use ICU
MessageFormat (`{count, plural, one {# item} other {# items}}`) — never string
concatenation.

### L4. Missing key = loud in dev, safe in prod
Dev/CI: a missing or unused key fails the build (lint + extract check). Prod:
render a visible fallback and log it — never crash, never show a raw key to the
user in a way that breaks layout.

### L5. Locale comes from the route
All routes are under `/[locale]/…`. Server code reads the request locale; never
read `navigator.language` on the client to pick copy. Formatting (currency,
number, date, relative time, list) goes through the shared `Intl` helpers so it
follows the active locale.

### L6. Seller/admin-authored content is data, translated separately
User-generated catalog/CMS content uses **localized fields** in the DB
(`24` section 5 / `26`), not the UI message catalog. A missing translation for such
content falls back to the default-locale value.

---

## M. Database changes & migrations  (see `25-database-conventions.md`)

### M1. No destructive migration ships with the code that needs it
Every schema change uses **expand → migrate → contract** across separate
deploys: add new (nullable/defaulted) structure → backfill via a job →
switch reads/writes → only in a *later* release drop the old column/table.
A single deploy never both drops a column and depends on its absence.

### M2. Forbidden in a live migration without an explicit, reviewed plan
Dropping/renaming a column or table in use; changing a column type in place;
adding a `NOT NULL` column with no default to a non-empty table; adding a unique
constraint without first verifying no duplicates; a blocking index build on a
large table (use `CREATE INDEX CONCURRENTLY`). Renames are add-copy-drop, never
`RENAME`.

### M3. Every migration is reversible or has a written recovery path
`down` migration where feasible; where not (data transforms), the PR states
exactly how to recover. Migrations are rehearsed on a prod-sized clone and the
lock time is measured and recorded in the PR.

### M4. Backfills are batched, idempotent, resumable jobs
Not inline in the migration. Chunked, rate-limited, safe to re-run, progress
logged.

### M5. Data loss is a release blocker
If a reviewer can construct any sequence of deploy + rollback that loses
committed data, the change does not merge.

### M6. Seeds: three profiles, split by domain
`packages/db/prisma/seed/` — one seed system for the whole app, `SEED_PROFILE`
picks the depth:

- **`minimal`** — the invariant core only (permissions, roles, role→perm wiring,
  optional bootstrap Super Admin). The production profile.
- **`demo`** — `minimal` + `demo/*`: a believable catalog + a few accounts you
  can put in front of a client. **No edge cases** — the moment a 200-char name
  or an archived-junk row lands here it leaks into a client demo.
- **`dev`** — `demo` + `fixtures/*`: every UI/UX edge case (deep trees, long /
  unicode names, archived + inactive rows, every status, combinatorial
  variants). Dev / CI only; **throws under `NODE_ENV=production`**.

All seeders are idempotent (keyed by slug / code / email). `run.ts` runs domain
seeders in FK-dependency order; each bounded context adds its own
`demo/<domain>.ts` + `fixtures/<domain>.ts` **in the same commit as the module**,
using the shared builders in `factories.ts`. Never `db:reset` / `migrate reset`
against a database without an explicit instruction — it drops everything.

---

## N. Data deletion  (see `25-database-conventions.md` section Deletion)

### N1. Default is soft delete
User-facing entities (products, offers, shops, reviews, categories, accounts,
addresses, messages, media) get `deleted_at timestamptz null`. A global Prisma
filter excludes soft-deleted rows; unique indexes are partial
(`… WHERE deleted_at IS NULL`).

### N2. Some records are never hard-deleted
Orders, sub-orders, order lines, invoices, ledger entries, payouts, audit
events, dispute records. Legal/financial retention wins over a delete request —
those are anonymized (PII stripped), not removed (`16` section 7, `20` section 5).

### N3. Every relation declares its delete behavior explicitly
For each FK, decide and document: `RESTRICT` (block delete while children
exist — default for anything financial/historical), `SET NULL` (child survives
without the parent — e.g. product.brand_id when a brand is removed), or
**app-level cascade via events** (soft-delete children in the owning service,
asynchronously). **Database `ON DELETE CASCADE` is banned** on anything crossing
a context boundary or touching money/history.

### N4. Deletion chains are designed before the delete button exists
For each "who can delete what", write the chain: what happens to dependents on
**soft** delete (hidden, kept, reconcilable) and what a **hard** delete (GDPR/
admin purge) touches, step by step, across services via events. Order snapshots
(`07`, `12`) keep history intact when a product/seller is later removed.

### N5. Deletes are authorized, audited, and reason-tagged
Same as any privileged mutation (`16` section 8). Bulk deletes are async jobs with a
per-row result report.

---

## O. Logging  (see `18-observability.md`)

### O1. One structured logger, JSON, no `console.*` in app code
Use `@shopnetic/observability`. `console.log` left in a PR is a review block
(lint-enforced). Logs go to stdout → the aggregator (Loki/Datadog); locally they
also tee to a rotating file so an error can be inspected after the fact.

### O2. Every log line is correlatable
Includes `correlationId`, `traceId`, `service`, `env`, `version`, and the
relevant domain ids (`orderId`, `sellerId` — never PII). A support agent pastes
one id and finds everything.

### O3. Log at the right level, log the decision
`error` = needs a human; `warn` = unexpected but handled; `info` = state
changes and request boundaries; `debug` = off in prod. Log *why* something
happened ("payout skipped: balance below threshold (…)"), not a vague "error
here".

### O4. Errors are logged once, with context, where they're handled
Don't log-and-rethrow at every frame (duplicate noise). Add context and rethrow,
or handle and log — not both repeatedly.

### O5. Never log secrets or PII (restated from I2)
Redacting logger with an allow-list. No request bodies of auth/payment
endpoints. No tokens, passwords, card data, full addresses, KYC contents.

---

## P. Validation & verification  (see `08` section 9, `16` section 4)

### P1. One schema, both sides
The Zod schema for a form/endpoint lives in `@shopnetic/contracts` and is used
by **both** the client (React Hook Form resolver, instant feedback) and the
server (reject at the boundary). They can never drift because there is one copy.

### P2. Client validation is UX; server validation is truth
Never rely on the client. The server re-validates everything — types, ranges,
business rules, ownership, price/stock/coupon recomputation — on every submit,
even if the UI "already checked".

### P3. Verify, don't just validate
Where a value must match reality, check reality server-side before the write:
email/phone ownership (OTP/link), address serviceability, coupon eligibility and
budget, stock availability, seller/product still active, price unchanged since
the user saw it (`29`). "Well-formed" ≠ "true".

### P4. Nothing is posted until it can succeed
Disable submit until the form is valid *and* not already pending. On server
rejection, map field errors back to inputs, keep the user's input, show a
form-level message.

---

## Q. Transactions & atomic writes  (see `25` section Transactions, `12` section 3)

### Q1. A multi-table write is one transaction
If saving a form/action touches 2+ tables **in the same service/database**, wrap
it in a single DB transaction. Partial success (row in table A, table B failed)
is a bug, not an edge case. Roll back the whole thing and return one error.

### Q2. Cross-service "transactions" are sagas, not distributed locks
When the write spans services/databases, use the outbox + saga pattern with
explicit compensation for every step (`02` section 4, `12` section 3). Never a 2-phase commit.

### Q3. Keep transactions short and side-effect-free
No network calls, no queue publishes, no email sends inside a DB transaction.
Do external work *after* commit (via the outbox), so a slow third party can't
hold locks or leave you half-committed.

### Q4. Choose isolation deliberately for money/stock
Stock decrement and coupon redemption use atomic conditional updates or
`SELECT … FOR UPDATE` / `SERIALIZABLE` (`12` section 8). Document the isolation level
and the concurrency argument in the PR.

### Q5. Idempotency alongside atomicity
An action that could be retried carries an idempotency key so a retry after a
partial failure produces one effect, not two (`08` section 6).

---

## R. Configuration & environment

### R1. One validated schema, no scattered `process.env`
Every process reads env through a single Zod schema (`config/env.ts` /
`loadDbEnv` / `server-env.ts`). Feature code never touches `process.env`
directly. Invalid/missing config fails the process at boot with a clear message,
not later at runtime (`B4`).

### R2. Every new/changed var updates `.env.example` **in the same change**
The `.env.example` for that app is the contract. A new var, a rename, a removal,
a changed default → edit `.env.example` (one-line comment each; real secrets
never committed) and the app's README env table in the same PR (`J6`). Say in
the comment which environments need it and any dev-vs-prod difference.

### R3. Behaviour flags default to the safe/production behaviour
A flag that changes how the app behaves is **off** by default and off means
"act like production". Turning it on is an explicit dev choice.

### R4. A dev shortcut that weakens security cannot reach production
If a flag relaxes auth, skips verification, disables a check, seeds test data,
or exposes internals: (a) it is **inert unless `NODE_ENV=development`**;
(b) `loadEnv` **throws at boot** if it is set with `NODE_ENV=production`;
(c) it has **no effect when `NODE_ENV=test`** so CI always exercises the real
path; (d) it is **logged at `warn` on boot** when active. It never changes the
password check, token issuance/verification, RBAC, or plane separation — only
the specific gate it names (e.g. `DEV_AUTH_RELAXED` skips staff TOTP + the
buyer email-verified gate; `DEV_RATE_LIMIT_DISABLED` turns off the `@RateLimit`
guards — nothing else). Note it in `16-security.md`.

### R5. Ports, URLs and hosts are configuration
No hard-coded `localhost:xxxx`, service URL, or DB host in feature code — it
comes from env (`I3`). Local defaults live only in `.env.example` and the
compose file.

---

## K. PR checklist (paste into every PR description)

```
- [ ] A2 done: happy path + error cases + corner cases + full list of files/layers
      touched, written below.
- [ ] Ambiguities raised and resolved (A1). Assumptions listed.
- [ ] No `any`; types clean under strict; API types imported from @shopnetic/contracts.
- [ ] No `'use client'` above leaf level; pages/layouts/providers stay Server Components.
- [ ] Reused existing components/utils; new shared logic lifted, not copy-pasted.
- [ ] Every async control: disabled + spinner + restore on success/error.
- [ ] Loading / empty / error / partial states implemented for every data view.
- [ ] User-facing errors are friendly + mapped from error codes; details go to logs/Sentry.
- [ ] No hard-coded user-visible text — every string via `t()` incl. error/validation messages (L1).
- [ ] Same Zod schema validates on client (UX) and server (truth); server re-verifies against reality (P).
- [ ] Multi-table writes wrapped in one transaction; cross-service via saga + compensation (Q).
- [ ] Schema change follows expand/contract; backfill is a batched job; no data-loss path on deploy+rollback (M).
- [ ] Delete behavior chosen per relation (soft default; no DB CASCADE across contexts); deletion chain written out (N).
- [ ] Server-side validation + authorization + idempotency for every mutation.
- [ ] Structured logger only (no `console.*`); logs correlatable; no PII/secrets (O).
- [ ] Tokens only (no magic colors/sizes); buyer/seller/admin visually consistent.
- [ ] a11y: keyboard, focus ring, roles/labels, aria-busy/live.
- [ ] Tests at the right layer; invariants covered; regression test for any bug fixed.
- [ ] Cache reads have invalidation; contract changes versioned.
- [ ] Admin visibility/moderation + reporting hooks added if user-facing.
- [ ] plan/ docs + ADR updated if a decision, contract, data model, flow, or open question changed (J5).
- [ ] README(s) + .env.example updated for any new/renamed env var, script, moved path, changed port, or new dep (J6).
- [ ] Docs use "section N" (not `§`); any new shorthand symbol/code is legended at first use (J7).
- [ ] New config goes through the validated env schema; behaviour/dev flags are safe-by-default, prod-rejected, test-inert, boot-logged (R).
- [ ] CI green.
```

---

## Changelog

- 2026-08-31 — Initial version. Seeded from the founder's 7 rules (A1, A2, C1,
  E1, F1/F2, B1, G1/G2) plus supporting rules.
- 2026-08-31 — Added L (i18n/copy), M (migrations), N (deletion), O (logging),
  P (validation/verification), Q (transactions), from the founder's second rule
  set. Checklist extended.
- 2026-09-03 — Added R (configuration & environment: validated env schema,
  .env.example discipline, safe-by-default behaviour flags, dev shortcuts that
  cannot reach production). D3 lists PasswordInput. Checklist updated.
- 2026-09-04 — R4 example list gains `DEV_RATE_LIMIT_DISABLED` (dev-only bypass
  of the `@RateLimit` guards, same safeguards).
- 2026-09-04 — Added J7 (doc notation: write "section N" not `§`; every doc
  legends its shorthand at first use). Repo-wide `§` → "section". Role/tier ×
  capability matrices (`03` section 4, `26` section 7) rewritten as ASCII grid
  tables; prose tables stay GFM.
- 2026-09-01 — Strengthened J5 (plan/ kept in lockstep with code, not just for
  "decisions") and added J6 (README.md + .env.example must track code changes).
  Checklist updated.
- 2026-09-07 — Added F8 (undo/retry handlers re-sync + "list changed" copy on
  their own failure) and H7 (mutate-then-reload robustness: no-store list GET,
  monotonic request id, mount-safe active guard vs the StrictMode cleanup-only
  ref footgun). Both from the Categories build; worked log in
  `apps/admin/src/features/catalog/categories/README.md`.
- 2026-09-08 — Added G9 (one `BarToast` shape for every `notify.*`; timer bar on
  all of them; duration = read time + act time, default 3s, ~5s for
  instruction/lost-context toasts, ~20s for undo). `notify.error`/`notify.info`
  gained an `ms` arg; new `--destructive-muted` token so the error toast isn't
  see-through.
- 2026-09-09 — H4 now requires normalising typed **and** pasted input in place
  (identifier fields live-transform, free-text collapses whitespace on blur,
  numeric leans on `type=number` + `z.coerce`) rather than only rejecting on
  submit. Categories `slug`/`name` fields do this; extract a `<SlugInput>` when
  Brands lands.
- 2026-09-09 — Added `DEV_RESPONSE_DELAY_MS` (+ `DEV_RESPONSE_DELAY_ROUTES`,
  `x-debug-delay` header) — dev-only artificial response latency for testing
  loading/skeleton states under realistic conditions, same R4-style safeguards
  as `DEV_AUTH_RELAXED`/`DEV_RATE_LIMIT_DISABLED` (inert outside
  `development`, rejected at boot in `production`, `warn` on boot). Not a
  security-relaxation flag, so not added to `16-security.md`.
- 2026-09-09 — H4 revised: `noValidate` is now mandatory on every RHF form (the
  browser's own constraint validation was hijacking submit + focus before
  RHF/zod ran); numeric-field normalisation extended to stripping a typed/pasted
  `-` when the range excludes negatives. Added H8 (a dead backend session
  redirects to login, computed from the current URL, with `?next=`). Added G10
  (border-or-not convention for controls; a toggle's tooltip/label always
  reflects the *current* state, never a fixed "X or Y" string; global slim
  scrollbars). G7 extended: confirm/toast copy caps an interpolated free-text
  value before embedding it, not after.
- 2026-09-09 — H4 corrected twice more, both from real bugs the first pass
  missed: (1) RHF's default focus-first-invalid-field walks `register()` *call*
  order, not JSX order — a hoisted `const x = register(...)` block declared out
  of visual order sends focus to the wrong field even with `noValidate` on. (2)
  stripping `-` in `onChange` alone doesn't work on `type="number"`: its DOM
  `.value` goes `""` the instant the typed text isn't a fully-valid number, so
  the handler can't see (or fix) what's on screen — block the key itself,
  sanitize `onPaste` separately. Global scrollbar width taken down to 6px.
- 2026-09-09 — E4 clarified: switching a list's filter/tab/segment (dataset
  swap) is a new first load → clear rows, show the skeleton; only a same-dataset
  background refresh keeps rows on screen. From the Categories time-related UI
  pass — Active/Archived/All tabs were leaving stale rows frozen during the
  fetch. Added a `<Skeleton>` primitive (`@shopnetic/ui`). `plan/28` section 10
  now covers back-office loading states end to end.
- 2026-09-09 — Added `DEV_FAULT_STATUS` (+ `DEV_FAULT_ROUTES`, `DEV_FAULT_BODY`,
  `x-debug-fault` header) — dev-only synthetic error responses for walking the
  frontend error-state matrix (F5), same R4-style safeguards as the other
  `DEV_*` flags. Runs after the delay middleware so slow-then-fail composes.
  Feeds an error-state pass over the admin surfaces (list/tab/detail load,
  add/edit, delete/restore/undo).
- 2026-09-10 — Categories error-state pass (using `DEV_FAULT_STATUS`). E5:
  error state renders *instead of* empty, never stacked; a whole-page view's
  "retry" may be a plain reload, no button required. F5: pure server/transport
  failures (5xx/429/malformed) may share one generic line per surface-owner's
  choice; offline keeps its own copy. `AdminApiError` now wraps a `fetch`
  rejection as `code: 'OFFLINE'` so `instanceof` checks catch it. Fixed a
  non-deterministic post-401 redirect (a `redirecting` latch in `adminApi`
  stops later calls racing the navigation). Added `error.tsx` at the admin
  `(protected)` segment (F4) so a render throw keeps the shell.
- 2026-09-10 — Security audit of the dev flags + auth/session stack (found
  solid: argon2id, RS256 audience-scoped JWTs, refresh rotation + reuse
  detection, rate-limited auth endpoints, RBAC fails closed). Two real gaps
  fixed: `helmet()` wired in `apps/api/src/main.ts` for baseline response
  headers (plan/16 section 3); `NODE_ENV` lost its `.default('development')`
  in `apps/api/src/config/env.ts` — every `DEV_*` safeguard hinges on it being
  set correctly, so a deployment that forgets it now fails loudly at boot
  instead of silently running with the permissive posture.
- 2026-09-14 — `TotpService.beginEnrolment` minted a *new* secret on every
  call while enrolment was pending — any second login attempt before
  confirming (a reload, a double-click) silently invalidated whatever the
  user had just scanned into their authenticator app. Now idempotent: reuses
  the pending secret until it's confirmed.
- 2026-09-10 — D3 gains `OtpInput` (`@shopnetic/ui`): segmented `0-9`-only
  one-time-code field (auto-advance, backspace-to-previous, paste-to-spread,
  `onComplete` auto-submit). Wired into the staff login enrol + MFA steps; a
  recovery code (not 6 digits) falls back to a plain `Input` behind a toggle.
  From the staff-auth UI/UX pass — also fixed the sign-in button resetting to
  idle in the gap before the post-login redirect renders.
- 2026-09-14 — `OtpInput`'s "click anywhere → jump to the first empty cell"
  guard read a stale `value` closure — a programmatic `.focus()` call fires
  its target's `onFocus` synchronously, one render before React catches up,
  so auto-advance kept getting reverted and every digit had to be typed by
  clicking each cell by hand. Found by walking the enrol screen with a real
  phone. Fixed with a ref updated the instant a digit commits, not just on
  next render. D3 gains `QrCode` (`@shopnetic/ui`) — the enrol screen scans
  instead of hand-typing a base32 secret; the secret stays as a collapsed
  manual-entry fallback.
- 2026-09-14 — Closed the staff-auth test gaps left from the login/MFA/enrol
  work above: rate-limited, wrong authenticator code, wrong recovery code
  (both stay on their own step rather than bouncing back to the other),
  `MFA_ALREADY_ENROLLED` on confirm, and a direct test of
  `(protected)/layout.tsx`'s session guard (redirect vs. render, no session
  vs. a valid one) — the first Server Component tested this way in the app;
  its own deps (`getCurrentStaff`, `AdminShell`) are mocked so the test is
  only about the redirect decision.
- 2026-09-14 — Built the staff-invite UI (`(protected)/staff`, closes the
  last real feature gap from the staff-auth pass): email + role form calling
  `identity/v1/staff/invites`. That endpoint needs the caller's *own* staff
  session (`staff:manage`, Super Admin) rather than the refresh-token cookie
  the other `/api/staff-auth/*` routes use — extracted the `/api/admin/*`
  proxy's Bearer-attach-and-refresh-on-401 dance into
  `features/admin-api/proxy-with-bearer.ts` so this new route (and the
  existing proxy, refactored onto it) share one copy instead of growing a
  second one. `callIdentityStaffApi` (`admin-api/bridge.ts`) is
  `callAdminApi`'s twin pointed at `identity/v1/staff` instead of `admin/v1`.
- 2026-09-15 — `accept-invite`'s heading/intro were fixed in `page.tsx`
  (Server Component), so "Set a password for your new staff account." kept
  showing under the done state after the password was already set. Moved
  into `AcceptInviteForm` itself, one per branch (form / done / invalid
  link), so the copy actually matches what's on screen. The done state then
  changed again same day: instead of "Your account is ready." + a manual
  "Go to sign in" link, it now auto-redirects to `login` after
  `REDIRECT_DELAY_MS` (3s) via a `useEffect` + `setTimeout` — a lingering
  manual link read as more work than a short, self-clearing wait. Also
  nudged the page up (`pt-20 sm:pt-28` instead of `justify-center` on a
  `min-h-dvh` column) — dead-center read as visually off for a two-line
  screen.
- 2026-09-15 — `@shopnetic/ui`'s toast `TimerBar` is now exported (D3):
  static/full-width by default, `absolute inset-x-0 bottom-0` moved onto the
  toast call sites' own `className` — so the same shrinking-bar primitive
  can sit in page content too, not just inside a toast box.
  `accept-invite`'s "redirecting" screen uses it.
- 2026-09-15 — Found via manual full-circle testing (invite → email → accept
  → login): a staff member already signed in could open an invite link
  (typically in the same browser that sent it) and it would silently accept
  the invite into their own session — `login` already guarded against a
  signed-in visitor (`redirect` to the dashboard) but `accept-invite` never
  got the same check. Extracted the shared logic into
  `features/staff-auth/redirect-if-signed-in.ts`'s `redirectIfSignedIn()`,
  used by both; any future public-only page (forgot-password, …) should call
  it too rather than re-deriving the check per page.
- 2026-09-15 — Nav wasn't role-aware: a normal Admin could see and submit the
  **Staff** invite form, only to be rejected by the API's own
  `@RequirePermission(STAFF_MANAGE)` (Super Admin only) — safe, but a
  confusing dead end. `SessionUser` (`@shopnetic/contracts`) gains an
  optional `roles: string[]` — staff plane only (computed from `Grant`/
  `Role` in `StaffAuthService.rolesFor`), other planes' session responses
  are unaffected. `nav-config.ts`'s new `visibleNavSections(roles)` drops a
  `superAdminOnly` item (and the whole section, once it's empty) for anyone
  without `SUPER_ADMIN`; the API stays the real gate, this only stops the
  client from showing a control that would just fail. Reminder for next
  time this bites: `@shopnetic/contracts` is consumed via its built `dist`,
  not source — `pnpm --filter @shopnetic/contracts build` after any schema
  change, or downstream typecheck fails on the *old* shape.
- 2026-09-15 — Built the staff directory (list + role change / unlock /
  TOTP reset / deprovision — the second item from the staff-auth backlog,
  bundled with its follow-on actions since they share one page and one new
  `StaffAccountsService`, not four separate small features). New
  `identity/v1/staff` `GET` + 4 mutation routes, all `staff:manage`;
  role-change *replaces* the account's grant in one transaction rather than
  adding to it; deprovision revokes every session
  (`SessionService.revokeAllForAccount`) as a belt-and-suspenders on top of
  `ActorService` already blocking a non-`active` account regardless.
  `CANNOT_MODIFY_SELF` (409) guards role-change and deprovision against the
  caller's own `accountId` — unlock/reset-totp don't need it, since being
  authenticated and being locked-out-of-TOTP are mutually exclusive.
  Client-side, `features/admin-api/client.ts`'s `adminApi` became
  `createApiClient(basePath)` so a second client (`staffManageApi`, → the
  new `/api/staff-auth/staff/[[...path]]` BFF catch-all) shares the same
  401-redirect logic instead of a second copy of it — `redirecting` stays
  one shared module-level flag across both. Found empirically while testing
  the new `StaffList`'s row-action menu: Radix's `DropdownMenuTrigger` opens
  on `pointerdown`/keyboard, not `click` — `fireEvent.click` in a jsdom test
  silently no-ops on it; `vitest.setup.ts` gained the pointer-capture
  polyfills Radix needs that jsdom doesn't implement, and the fix on the
  test side is to open the menu via `fireEvent.keyDown(trigger, {key:
  'Enter'})` instead of a click.
- 2026-09-15 — Found live (screenshot from a real signed-in session): the
  staff-directory BFF catch-all was `[...path]` (required) — Next.js
  doesn't match that pattern at all for zero extra segments, so `GET
  /api/staff-auth/staff` (the list call) 404'd at the routing layer,
  never reaching the handler, while every mutation route (`:accountId/role`
  etc., always ≥1 segment) worked fine. Renamed the folder to `[[...path]]`
  (optional catch-all) and handled `path` being `undefined` for that
  zero-segment case. A reminder for any future catch-all BFF proxy that
  needs to answer its own bare prefix, not just sub-paths under it.
- 2026-09-15 — Found live: a Deprovisioned (`disabled`) staff account had no
  way back to `active` — `StaffAccountsService.unlock()` only accepted
  `status: 'locked'`, and the frontend only offered "Unlock" for a `locked`
  row. Renamed `unlock` → `activate` (API method, controller endpoint
  `POST :accountId/unlock` → `:accountId/activate`), and relaxed the guard
  to accept either `'locked'` or `'disabled'` — one mechanism, not a
  duplicate "reactivate" action, since the only real difference is *why*
  the account got there, which the caller already knows from `status` and
  reflects purely in button/toast copy ("Unlock" vs "Reactivate"). No new
  self-guard needed, same reasoning as the original `unlock`: you can't be
  simultaneously authenticated and locked-out-or-disabled.
- 2026-09-15 — Restructured the **Staff** nav item into an expand/collapse
  group (`NavItem.children`, one level only) with **List** (`/staff`) and
  **Invite** (`/staff/invite`) as separate pages instead of one page
  stacking the directory table above the invite form. Expand state
  (`expandedGroups`, keyed by `NavItem.key`) lives in `useSidebar()`, not in
  `Sidebar`, because the desktop rail and mobile drawer mount two separate
  `SidebarBody` copies that need to stay in sync rather than drift apart —
  matches the existing pattern for `collapsed`/`mobileOpen`. A child route
  being current auto-expands its group (`expanded || anyChildActive`) with
  no click needed. Found while writing that auto-expand test: `isActiveHref`
  is a `pathname.startsWith(href)` prefix check, so a parent-shaped path
  like `/staff` is technically also a prefix of `/staff/invite` — without
  care, *both* children would show `aria-current`. `NavItemRow` now picks
  the single longest-matching child path as the "current" one instead of
  trusting each child's independent prefix match. Separately, the same test
  first failed for an unrelated reason worth remembering: this test file's
  `next/link` mock only forwarded `href`/`children`, silently dropping
  `aria-current` (and `onClick`, `className`) from the rendered `<a>` — any
  test mocking `next/link` and asserting on more than `href` needs to spread
  the rest of the props through.
- 2026-09-15 — Asked directly "did you apply G7 for a long email in the
  staff list": no, only partially. The `truncate` class on the email
  `TableCell` was inert — `Table` defaults to auto-layout + horizontal
  scroll (`scrollX` true), so a long value just grows the column or scrolls
  instead of clipping. Fixed to match `category-tree.tsx`'s established
  pattern: `<Table className="table-fixed" scrollX={false}>` with explicit
  widths on the narrow columns, `truncate` on an inner wrapper span (not the
  `<td>` itself) with `title={account.email}` so the full value is still a
  hover away. Also hadn't capped the email before interpolating it into
  confirm-dialog messages, toasts, or the role-change modal description
  (G7's "interpolated into a fixed-width dialog" rule) — added a local
  `capForMessage(value, max=60)` helper and applied it at every interpolation
  site in `staff-list.tsx`. Reminder: `truncate` alone proves nothing without
  `table-fixed` (or an otherwise width-bounded ancestor) — check for that
  first before trusting a truncate class is doing anything.
- 2026-09-15 — Asked "didn't we talk about change password, audit log,
  forgot password" — audited: the audit-log *API* existed
  (`GET identity/v1/audit-events`) but had no admin UI; change-password and
  forgot-password didn't exist at all, API or UI, for either plane. Built
  all three, staff plane only (buyer plane deferred — explicit user choice,
  not an oversight):
  - **Audit log UI** (`(protected)/audit-log`): `AuditController` now joins
    `actor: { select: { email } }` and returns `before`/`after` too (were
    already columns, just never serialized). New BFF route + `bridge.ts`
    helper `callIdentityApi` (base `identity/v1`, not `.../staff`) since
    this endpoint isn't under `staff:manage`. `createApiClient` gained an
    `opts.raw` flag — return the whole `{data, meta}` envelope instead of
    unwrapping to `data` — the first caller (`auditLogApi`) that needs
    `meta.nextCursor` for pagination; every earlier client only ever needed
    `data`. Nav item is deliberately *not* `superAdminOnly`: Service Admin
    and Admin both hold `auditlog:read` too (partial, vs Super Admin's
    full — the API doesn't scope rows down for partial yet, a known gap).
    This also means "Administration" no longer disappears for a normal
    Admin (nav-config tests + admin-shell tests updated accordingly).
  - **Change password** (self-service): `StaffAuthService.changePassword`
    verifies the current password, then `revokeAllForAccount(id,
    'password_change')` — a reason value that already existed in
    `SessionService`'s type union, unused until now. `StaffAuthGuard` alone
    (no `@RequirePermission`) since any staff member may change their own.
  - **Forgot / reset password**: new `PasswordResetService`, deliberately
    *not* folded into `VerificationService` even though both wrap the same
    `email_verification` table (`purpose: password_reset` vs `verify_email`)
    — kept separate so a staff-plane change can't touch the buyer-plane
    verify-email flow. New `PASSWORD_RESET_TTL_HOURS` env (default 1h,
    deliberately short — a live reset link is a bigger risk than a
    verify-email link). `PASSWORD_RESET_TOKEN_INVALID` vs `_EXPIRED` as two
    codes, matching the existing invite-token and verify-email-token split
    rather than inventing a stricter single-code pattern.
  - Recurring gotcha hit twice while verifying live: `apps/api`'s `node
    --watch` process silently stopped picking up saves partway through this
    session (routes kept 404ing against code that typechecked and had
    passing tests) — `touch apps/api/src/main.ts` forces a real restart.
    Always confirm the live route is actually mapped (`grep "Mapped.*route"
    /tmp/api-dev.log`) after API changes, don't trust the watcher blindly.
- 2026-09-15 — Three bugs reported from live use of the features above,
  fixed same day:
  - **Change-password's server error broke H4** ("every field shows its
    own error"): `INVALID_CREDENTIALS` was rendered as a generic banner
    above the submit button instead of inline under the field it's
    actually about. Fixed to match `category-form-modal.tsx`'s established
    `FIELD_FOR_CODE` + RHF `setError(field, {type:'server', message}, ...)`
    pattern — a code that clearly belongs to one input goes there;
    everything else stays a form-level banner. Caught in review that my
    first test for this wasn't actually meaningful: `screen.findByText(...)`
    matches the error text wherever it renders, banner included, so it
    passed even with the old (wrong) behavior — had to assert the error
    node's *direct parent* is that field's own wrapper `<div>`, not just
    "present somewhere on the page," to make the test discriminate at all.
  - **Forgot/reset-password pages were vertically centered** (`justify-center`,
    login's pattern) instead of top-anchored like `accept-invite`'s page
    (`pt-20 sm:pt-28`). Both pages swap between form / done / invalid-link
    states of different heights — centering makes the block visibly jump on
    every swap. `accept-invite` already got this right; forgot/reset-password
    just didn't copy it. Fixed both to match.
  - **Audit log logged the viewer out on click** — `AuditController` had
    always used the generic `AuthGuard` (verifies against the *storefront*
    audience only), never `StaffAuthGuard` (`aud=admin` + `plane=staff`).
    `auditlog:read` is staff-only in practice (plan/03 section 4), so this
    was a latent bug since Slice 3 that nothing had exercised from the staff
    plane until the admin UI landed today — every real admin Bearer token
    got rejected as unauthenticated, which the admin BFF's dead-session
    handling reads as "sign back in" and bounces to login. Fixed by swapping
    to `StaffAuthGuard`. Not caught by the integration test written earlier
    the same day — that test instantiates `AuditController` directly and
    calls `.list()`, bypassing the guard pipeline entirely, which is how
    every controller in this codebase is tested (no e2e/supertest
    infrastructure exists here at all). Added a narrower regression test
    instead: mint a real `aud=admin` token, run it through `StaffAuthGuard`
    and (for contrast) the old `AuthGuard` directly, plus a
    `Reflect.getMetadata('__guards__', AuditController)` check that the
    controller is actually wired to the right one. General lesson: a
    guard-only bug is invisible to a test that instantiates the
    controller/service directly — it needs the actual guard class exercised
    against a real signed token, not just the downstream method.
- 2026-09-15 — Built cursor-pagination + load-on-scroll for Audit Log, the
  Staff directory, and Categories' flat views — the deferred backlog item
  from `categories/README.md` ("Infinite-scroll the flat views"), plus the
  two newer lists that never had it either.
  - **Shared primitive**: `components/crud/use-scroll-load.ts`'s
    `useScrollLoad`. First page on mount; a sentinel element (last child of
    the rendered list) watched with an `IntersectionObserver` loads the
    next page while it's inside the visible, scroll-clipped area — which is
    true immediately, before any real scroll, whenever a page doesn't
    already fill the viewport, so a short first page keeps auto-loading
    until the list actually needs to scroll. No separate "does this fill
    the viewport" check needed for that; an already-visible sentinel firing
    on mount gives it for free. `resetKeys` (a query-key list — status tab,
    debounced search, …) reloads from scratch when any of them change;
    `enabled` skips fetching entirely for a data source that isn't the one
    currently on screen (Categories' flat-mode fetch must not fire while
    the tree is what's showing). `loadError` distinguishes the *first* page
    failing (empty-state error view) from a *later* one failing (rows
    already on screen must not disappear — a small "couldn't load more" +
    retry near the bottom instead); `loadMore()` is exposed directly for
    that retry, since the sentinel's observer only fires on a real
    visibility change, not on every render. jsdom has no
    `IntersectionObserver` at all — `src/test/intersection-observer.ts`
    installs a controllable mock (`triggerIntersection(el)`) via
    `vitest.setup.ts`.
  - **Audit Log**: pure frontend change, the API already had cursor
    pagination. Replaced the manual "Load more" button with the sentinel.
  - **Staff directory**: `GET identity/v1/staff` gained `?cursor=&limit=`,
    ordered by `id` (a v7 UUID — sorts by creation time the same way
    `createdAt` would, and is the stable/unique field keyset pagination
    needs) rather than `createdAt` directly, matching `AuditController`'s
    same choice.
  - **Categories**: the biggest piece — `CategoryService.list()` gained
    `q`/`cursor`/`limit`, all optional; `limit` omitted (the active tree's
    own load) behaves exactly as before, every matching row in `path,
    position` order — a tree can't render a page boundary without either
    breaking the hierarchy or prefetching ancestors, so it never
    paginates. Search moved **server-side** in the same pass (a user
    decision, not assumed): `tokenizeForSql` in `category.service.ts` is a
    byte-for-byte port of `@/lib/search`'s tokenizer, so a query now
    searches the whole table instead of whatever page happened to be
    loaded — same normalize, same ≥2-char/≤10-token rules, same OR
    semantics, same score ordering, just in SQL instead of `Array.filter`.
    Two cursor shapes depending on whether there's a search query, both
    opaque to the client: no-search pages on the row's `path` (globally
    unique — embeds the row's own id); search pages on a stringified
    offset instead, since a ranked result set has no natural keyset order.
    Found and fixed two of my own wrong test assertions while building
    this: I'd assumed OR-semantics search would *exclude* a partial match,
    which is backwards — reverting the code to AND-semantics and
    OR-semantics both needed to visibly break a test before I trusted
    either was really being exercised (see G-something on meaningful
    verification). The real architectural fork was the frontend: several
    cross-cutting checks (`parentArchived`, `archivedDescendants`, the
    create/edit modal's parent-picker) scan the *complete* active-category
    set regardless of which view is on screen — paginating naively would
    have made them silently see incomplete data. Resolved by leaving the
    tree's own unpaginated `items` load running in the background
    unconditionally (unchanged from before this pass) and adding the flat
    paginated view as a **parallel**, independent data source used only
    for the rendered table/cards — one extra background fetch on every
    Archived/All tab switch that goes unused for that render, but zero
    behavior change to anything that reads the complete set. `isFlatMode
    = status !== 'active' || searching` is the one condition gating which
    data source actually renders. Ancestor-breadcrumb resolution
    (`useAncestorPath`) works correctly across pages for the *non-search*
    case for a structural reason worth remembering: a parent's `path` is
    always a strict prefix of every descendant's, and pages accumulate
    rather than replace, so every ancestor of a loaded row has necessarily
    already loaded on an earlier page — no special-casing needed. Search
    results don't get that guarantee (ranked by score, not tree structure)
    and can show an incomplete breadcrumb for an ancestor that doesn't
    itself match the query — an accepted, documented limitation, not a bug,
    matching `useAncestorPath`'s existing (pre-pagination) behavior for a
    filtered result set.
- 2026-09-15 — Screenshots at a 321px ("SP") viewport showed Staff List and
  Audit Log hadn't picked up G7's data-table card breakpoint: overlapping
  headers, columns cut off with no way to reach them. Neither had followed
  the pattern Categories already established (`hidden md:block` table +
  `md:hidden` card list). Fixed both the same way; Staff List's row menu
  got extracted into a shared `renderMenu()` so table and cards render the
  identical actions. Verified live, not just by test: a headless-browser
  login + TOTP flow at 321×801 against the real dev stack, screenshotted
  both pages. (Retroactive entry — this landed in `e1fc6ac` without one.)
- 2026-09-15 — A direct question about mail delivery reliability under load
  ("might lose some mails under too many requests") became
  `plan/31-background-jobs-and-queues.md`: BullMQ on the Redis already
  provisioned, `apps/api` enqueues / `apps/workers` processes. Then built
  the first slice: all 5 existing inline `MailService.sendXxx` call sites
  now enqueue instead of sending directly. `MailService` renders the
  template and calls `MailQueueService.enqueue({to, subject, text})`
  (`apps/api/src/queue/`, a `@Global` module mirroring `RedisModule`'s
  shape); `apps/workers` went from an idling stub to a real `Worker` —
  `src/mail/mail-processor.ts` does the actual nodemailer send,
  `src/main.ts` wires it up, `src/config/env.ts` validates
  `REDIS_URL`/`SMTP_URL`/`MAIL_FROM` the same way `apps/api` validates its
  own env. `@shopnetic/events` gained `QueueName`/`MailSendJob` — job
  contracts, deliberately kept distinct from the existing `DomainEvent`
  export (a queue "command" is "do this reliably once"; a domain event is
  "something happened, N may care" — different shape, same file, same
  reason it already existed for cross-app shared vocabulary).
  `SMTP_URL`/`MAIL_FROM` moved out of `apps/api`'s env schema entirely —
  dead config once nothing there reads them; they now live only in
  `apps/workers`. Each BullMQ `Queue`/`Worker` gets its **own** ioredis
  connection (`maxRetriesPerRequest: null`, BullMQ's own requirement for
  blocking commands) — deliberately not reusing `apps/api`'s existing
  `RedisService` connection, which is tuned differently
  (`maxRetriesPerRequest: 2`) for rate-limit buckets. Verified live, not
  just unit tests: ran the real dev stack (`apps/api` + `apps/workers` +
  real Redis), fired two real `forgot-password` requests, confirmed both
  jobs landed in `bull:mail:completed` with the correctly rendered
  subject/link — real SMTP delivery succeeded end to end. One gap left
  open on purpose: no per-job idempotency key yet (a caller-side
  double-submit isn't deduped) — none of today's call sites have an
  obvious stable key to build one from without more design, and it's
  low-stakes enough to file as a follow-up rather than block the slice on.
- 2026-09-15 — Asked directly whether the sidebar's nav-group expand/collapse
  (the "Staff" group opening to show List/Invite) animated. It didn't — the
  chevron rotated but the child list itself was a plain `{isOpen && <ul>}`,
  popping in/out instantly. Fixed with `grid-rows-[0fr]` ⇄ `grid-rows-[1fr]`
  + `transition-[grid-template-rows]` on a wrapper, `overflow-hidden` on the
  single grid child — no hardcoded max-height, works for content of any
  length. Had to stop unmounting the `<ul>` when closed (a conditional
  mount has nothing to animate from/to) and use `inert` instead, so its
  links stay out of tab order/hit-testing while collapsed without actually
  leaving the DOM — `admin-shell.test.tsx`'s "expanding it shows List +
  Invite" test updated to assert the `inert` attribute flips, not presence/
  absence in the document. Generalized into new section **G11** rather than
  just fixing the one spot: any state change that shows/hides, resizes, or
  repositions now needs a transition, with the technique keyed to what's
  changing (plain `transition-*` for a token value already changing;
  `grid-rows` for a height that isn't fixed; Radix's `data-state` for
  anything already on Radix). Added the global
  `prefers-reduced-motion` handling this rule leans on
  (`packages/ui/src/tokens.css` — collapses durations near-zero, doesn't
  use `transition: none` since some code waits on the end event). Flagged,
  not fixed, three existing instant-toggle spots the new rule catches:
  `Modal`/`ConfirmDialog` open/close, the audit-log per-row detail expand,
  the category tree's row-reveal-on-expand.
- 2026-09-16 — Feedback on the G11 work above, live: the sidebar transitions
  were "very quick," even though they weren't skipped (200ms). Bumped every
  one (desktop rail width, mobile drawer transform+opacity, nav-group
  grid-rows, the group's chevron rotation) to 300ms so they'd sync at the
  new duration too — the chevron finishing its rotation early, while the
  list was still 200ms into expanding underneath it, would have read as
  desynced rather than just "now slower." Turned into the concrete
  `duration-300 ease-out` guideline in G11 above rather than a one-off
  number, since the same "too quick to perceive" gap is likely to recur
  anywhere else this pattern gets used.
- 2026-09-16 — Asked about the topbar account dropdown (email → Change
  password / Sign out) — same G11 gap, an instant snap, Radix `data-state`
  never styled. `DropdownMenuContent` is shared by the topbar menu *and*
  every per-row `⋮` action menu (Staff List, Audit Log), so fixing the one
  component fixed all of it at once. Built `.sn-popover`
  (`packages/ui/src/tokens.css`) — a fade+scale keyed off `data-state`,
  reusable by any other Radix popover — instead of inlining the animation
  in `dropdown-menu.tsx` directly, since `Modal`/`ConfirmDialog` need the
  exact same treatment and were already on the known-gaps list. Surfaced
  that G11's single `duration-300` guidance didn't fit a small click-to-open
  menu — reads sluggish at panel-scale duration — so split it into two
  tiers: panel-scale (300ms, unchanged) and popover-scale (150ms open/100ms
  close, asymmetric on purpose — closing quicker than opening reads as
  responsive when dismissing). `Modal`/`ConfirmDialog` remains open per the
  gap note above pending a decision on which tier a modal actually wants.
- 2026-09-16 — Asked "shouldn't the topbar account-menu chevron flip when
  open, like the Staff nav-group's does" — yes, same G10 ("a control looks
  like what it does") + G11 (state-driven visual) shape, just not applied
  to this second trigger yet. Fixed with a different technique than the
  nav-group's (which flips off local `isOpen` state): the trigger is
  `RDropdown.Trigger`, and Radix already puts `data-state="open"|"closed"`
  on it directly — marked the trigger `group`, the chevron
  `group-data-[state=open]:rotate-180`, no local state needed at all.
  Reusable for any future Radix-trigger-plus-chevron pairing (a `Select`-
  style control, if one gets built) without wiring a controlled `open`
  prop just to drive an icon. Test asserts the wiring (`group` present,
  `data-state` actually flips on interaction) rather than the rendered
  rotation, which is a CSS cascade jsdom doesn't evaluate — reverted each
  half (the `group` class, the chevron's own class) separately to confirm
  the test catches either one going missing, not just both together.
- 2026-09-16 — Flagged: Staff List's row `⋮` and Audit Log's expand chevron
  had no hover hint at all on PC — just an `aria-label`, invisible to a
  mouse user. Checked first whether this was a missing convention or a
  missed spot: turned out `category-list.tsx`/`category-tree.tsx` and three
  of `topbar.tsx`'s own buttons already use a native `title=` for exactly
  this, so it's a missed spot on these two, not a net-new pattern to
  invent. Built the nicer version instead of just copying `title=`, since
  the infra for it (`.sn-popover`, `TooltipProvider`) already existed from
  the dropdown-menu work: a new `Tooltip`/`TooltipTrigger`/`TooltipContent`
  wrapper over `@radix-ui/react-tooltip` (`packages/ui/src/components/
  tooltip.tsx`), `TooltipProvider` wrapping `AdminShell` once so every page
  gets it for free, and `renderAdmin` (the test helper) wrapped the same
  way so component tests don't need their own provider setup. Documented
  in G10 as the new default for icon-only controls, `title=` left as the
  older-but-working convention elsewhere — not retrofitting everything in
  one pass. Tests trigger via `fireEvent.focus`, not simulated hover: focus
  shows a Radix tooltip immediately (no delay, and it's the correct
  behavior for a keyboard user regardless), where hover would need fake
  timers for `delayDuration` and be flakier for no real benefit. Audit
  Log's test also checks the tooltip text itself flips with state ("View
  details" ⇄ "Hide details"), not just that a tooltip exists at all.
- 2026-09-16 — Discussed two real-world password-reset screenshots (Amazon's
  "sign-in attempt was approved" and "someone is attempting to reset the
  password... Deny") against our own staff-plane reset flow. Findings and
  what got fixed:
  - **A reused/already-consumed link showing a scary "invalid" message,
    when it's actually a success** — split `PASSWORD_RESET_TOKEN_INVALID`
    into two codes: `_INVALID` (unknown/malformed token) stays an error;
    `_ALREADY_USED` (a real token, already spent) is not treated as an
    error at all — `ResetPasswordForm` now shows a calm message-variant
    screen ("Already reset... sign in with your new one") with the same
    auto-redirect as the success (`done`) state, instead of a red form
    error. Amazon's approved-sign-in screen was the reference for the
    tone.
  - **A same-channel "Deny this reset" link — considered, deliberately not
    built.** Amazon's Deny mechanism only has real security value because
    it travels a channel the attacker doesn't control (push to an
    already-trusted device), separate from the reset-link email. We're
    email-only — a Deny link in the *same* email as the reset link
    protects against nothing an attacker with inbox access couldn't
    already ignore. Revisit only if a second channel (push/SMS/a
    companion app) ever exists; not worth building against the current
    single channel.
  - **A real race in `PasswordResetService.consume()`**: read-then-write
    (`findUnique` then a separate `update`) meant two near-simultaneous
    uses of the same token could both pass the "not yet consumed" check
    before either write landed, both proceeding to reset the password.
    Fixed with an atomic `updateMany({ where: { id, consumedAt: null } })`
    — only the request that actually flips `consumedAt` gets `count: 1`;
    the loser gets `count: 0` and is correctly treated as already-used.
    Verified with a real concurrency test (`Promise.allSettled` on two
    `resetPassword` calls with the same token) — reverted to the old
    read-then-write to confirm the test actually catches it (both
    succeeded without the fix) before restoring.
  - **Sibling reset tokens staying valid after one was used**: requesting
    "forgot password" more than once issues an independent token each
    time; using one didn't invalidate the others, which stayed live until
    their own separate expiry. `consume()` now also marks every other
    unconsumed token for the same account+purpose as consumed once one
    succeeds.
- 2026-09-16 — Two real bugs found live, testing the fixes above: (1)
  reopening an already-used reset link showed the password form again —
  the new "already used" message from the earlier fix only fired on
  *submit*, and the page never checked the link's status on *load*, so it
  showed a form that could never have worked until the user filled it in
  and hit submit. (2) the reset-password page had no way back to login at
  all — `forgot-password`'s "Back to sign in" link never got copied over.
  Fixed both:
  - Added `PasswordResetService.peek()` (shares its checks with `consume()`
    via a new private `validate()`) — read-only, doesn't touch
    `consumedAt`, doesn't invalidate siblings. New `GET
    identity/v1/staff/auth/reset-password?token=` (same path as the
    existing `POST`, different verb) backs it; `StaffAuthService.
    checkResetToken()` is the thin wrapper the controller calls.
    `ResetPasswordForm` now fires this on mount before ever showing the
    form — added a `checking` status shown while it's in flight, and a
    dead link (already-used/expired/unknown) now shows its message
    immediately, no submission needed. Verified `peek()` is actually
    read-only with an integration test (peek, then a real `resetPassword`
    with the same token still succeeds) — and confirmed the test is
    meaningful by temporarily making `peek()` call `consume()` and
    watching it correctly break.
  - Elevated the *submission-time* discovery of the same three token
    codes (a rare race — the tab sat open past expiry, or a double-submit)
    to the same dedicated screens instead of an inline form error, so a
    dead token gets the identical treatment whether it's caught on load or
    on submit.
  - Added a "Back to sign in" link (`resetPassword.backToLogin`, same
    pattern as `forgotPassword.backToLogin` — a separate key, not shared
    across namespaces, matching how every other generic string here
    already has its own per-namespace copy) to every state on the reset
    page: the form itself, both dead-link screens, and the already-
    used/done screens (which also auto-redirect, but immediate access
    beats waiting on a timer).
  - `apps/admin/src/features/staff-auth/components/accept-invite-form.tsx`
    has the exact same pair of gaps (no mount-time check, no back-to-login
    link) — not fixed here, flagged for whenever that page is next
    touched.
- 2026-09-16 — Asked whether `forgotPassword` lets *any* email trigger a
  reset — checked live rather than guessing: sent it for a real buyer
  email and a made-up one, both got the identical `202`, but the mail
  queue's completed count didn't move for either. Already correct — the
  uniform response is deliberate (enumeration-safety), the actual gate
  (`plane === 'staff' && status === 'active'`) runs silently behind it.
  The follow-up question — the same decision, generalized to every future
  plane/entity and account-status combination — got its own table rather
  than a one-off answer, since it's exactly the kind of thing that's cheap
  to get right once and easy to get wrong piecemeal later: **plan/16-
  security.md**, "Password-reset eligibility — decision table" (Passwords
  subsection). Corrected one assumption in how the question was framed
  along the way: buyer and seller aren't separate accounts to check
  against separately — `03-users-and-rbac.md` §1 already states a single
  human can hold both via multiple role grants on **one** account, so
  "does this email belong to a seller, not a buyer" isn't a real case; the
  only real axis is plane (staff vs. marketplace). Landed on one general
  rule instead of enumerating every plane separately: gate on "would this
  account be able to log in with the new password" — full lockout/
  deprovision (any plane) never gets a link (it wouldn't help and is just
  surface area); a feature-level restriction that leaves login itself
  intact (a suspended seller who can still browse/buy, once that concept
  exists) still gets one, because resetting a password is a separate
  action from whatever feature got restricted. Surfaced a real,
  currently-latent gap while building the table: staff's `status ===
  'active'` check excludes `locked` the same as `disabled`, but `locked`
  is documented (this file, Passwords bullet above) as a *soft, automatic*
  lockout — exactly the situation password reset is supposed to rescue
  someone from, unlike a deliberate `disabled`. Not fixed — nothing in the
  codebase sets `status = 'locked'` yet (the lockout mechanism itself
  isn't built), so there's no live bug to reproduce, just a decision to
  make correctly once it is.
- 2026-09-16 — Two follow-ups from testing the reset-password fixes above.
  (1) The "Back to sign in" link had landed on `forgotPassword` and
  `resetPassword`'s auto-redirecting states but not on
  `change-password-form.tsx`'s own auto-redirecting `done` overlay — an
  inconsistency, not a deliberate distinction. Decided one firm rule
  instead of a per-page judgment call: every screen that auto-redirects or
  dead-ends gets an immediate way back to login, full stop — added the
  missing link (and its own `changePassword.backToLogin` copy key,
  matching the existing per-namespace-copy convention) to the
  change-password done overlay; nothing removed anywhere.
  (2) `accept-invite-form.tsx`, flagged above as having "the exact same
  pair of gaps" as reset-password before its fixes, got the identical
  treatment now rather than staying flagged: `StaffInviteService.accept`
  had the same collapsed `!invite || invite.acceptedAt != null` →
  `INVITE_INVALID` (now split into `INVITE_INVALID` vs. the new
  `INVITE_ALREADY_ACCEPTED`) and the same TOCTOU race shape (a `findUnique`
  read followed, much later, by a `$transaction` write) that
  `PasswordResetService.consume` had. Fixed both: extracted a shared
  `validate()` (mirroring `PasswordResetService`'s), added a read-only
  `peek()` backing a new `GET invites/accept` endpoint (mirroring `GET
  auth/reset-password`) so `AcceptInviteForm` can mount-check like
  `ResetPasswordForm` does, and made the claim atomic via
  `staffInvite.updateMany({ where: { id, acceptedAt: null } })` *before*
  the account-creation transaction runs — checked `count === 0` and threw
  `INVITE_ALREADY_ACCEPTED` — so two near-simultaneous accepts of the same
  invite can no longer both create an account. `AcceptInviteForm` got the
  full `ResetPasswordForm` status-machine treatment (`checking` → `form` /
  `invalid` / `expired` / `alreadyAccepted` / `done`, all with a back-to-
  login link). Verified meaningfully at every layer: reverted the atomic
  claim back to a plain `update` and re-ran the integration race test —
  got a Prisma unique-constraint crash (two accounts almost created) and
  the wrong error code, confirming the fix is load-bearing, not
  redundant; reverted `peek()` to actually consume the invite and re-ran
  its "still usable after peeking" test — it failed for exactly that
  reason; re-collapsed `validate()`'s two branches back into one
  `INVITE_INVALID` and re-ran the split-code tests — both failed for
  exactly that reason. Restored all three, confirmed the full API
  integration suite (25 tests in this file, 84 total) and the admin unit
  suite (118 tests, including 12 new ones for `AcceptInviteForm`) pass
  green, then walked the fix live end-to-end through the running dev
  stack (not just the test suite): created a disposable invite directly
  in Postgres, hit the admin BFF's `GET`/`POST /api/staff-auth/accept-
  invite` the same way the browser page does, confirmed the mount check
  resolves before accepting, `INVITE_ALREADY_ACCEPTED` (not a generic
  "invalid") comes back both from a second `GET` and a second `POST` after
  accepting once, and cleaned up the disposable rows after.
- 2026-09-16 — Added a "back to top" affordance for long admin lists
  (`ScrollToTopButton`, `packages/ui/src/components/scroll-to-top-button.tsx`),
  wired into Category List, Staff List, and Audit Log. Two real bugs found
  and fixed while building it, both worth keeping in mind for any future
  "floating over scrolled content" component in this codebase:
  (1) The admin shell doesn't scroll `window` — `admin-shell.tsx` has
  `h-dvh overflow-hidden` on its root, and the actual scrolling happens on
  an inner `overflow-y-auto` div wrapping `<main>`. A plain
  `window.addEventListener('scroll', …)` would silently never fire.
  (2) First attempt found the real scroll container by walking up the DOM
  from mount and requiring the ancestor to *already be overflowing*
  (`scrollHeight > clientHeight`) at that instant — reasonable-looking, but
  wrong for any cursor-paginated "load on scroll" list (Audit Log
  especially): its first page can render before it has enough rows to
  overflow yet, so the one-shot check at mount fails, skips past the real
  container, and locks onto `window` for the component's whole lifetime —
  live-tested, reported by the user as "cannot see [it] in audit-log."
  Fixed by matching on the CSS `overflow-y: auto`/`scroll` property alone,
  which is the correct, timing-independent signal for "this is the element
  that scrolls" — dropped the "is it currently overflowing" condition
  entirely. Added a regression test reproducing the exact scenario
  (container not yet overflowing at mount, then grows past it) and
  confirmed it fails against the old logic with the identical symptom,
  passes with the fix. (3) The requested "glassy" look
  (`bg-background/NN` + `backdrop-blur`) rendered as a plain white circle,
  reported as "bg look more white" — not a tuning bug, a structural one:
  `--background` in light mode is literally `0 0% 100%` (pure white), so a
  `background`-tinted glass over a mostly-white admin panel has zero
  hue/lightness difference from the page for the blur to reveal, at any
  opacity. Fixed by tinting with `foreground` instead — the one token
  that's defined to always contrast against `background` in either theme
  (dark-on-light in light mode, light-on-dark in dark mode) — so the glass
  reads as visible against the page by construction, not by luck of what
  happens to be behind it. Exported as `GLASS_SURFACE` from
  `@shopnetic/ui` so a future button can opt into the same look without
  re-deriving this; nothing else uses it today, and it's not a new
  default. All three list pages share one `admin.actions.backToTop` copy
  key (unlike the auth-flow "Back to sign in" links, which are
  page-specific enough to warrant separate copy each) since this text is
  identical everywhere it appears.
- 2026-09-16 — Added filtering to Audit Log: free text (actor email,
  `targetId`, `action`, `reason`, plus `after`/`before ->> 'email'` — the
  one JSON key worth reaching, since `identity.account_registered` has no
  other admin lookup surface yet), a Domain tab (All/Catalog/Identity,
  matched via `action LIKE '<domain>.%'`), a Target type select, and a
  From/To date range — `AuditController.list` moved from a plain
  `prisma.auditEvent.findMany` to `$queryRawUnsafe`, mirroring
  `CategoryService.list`'s own tokenized-search raw-SQL pattern
  (`tokenizeForSql` duplicated rather than shared, same as that file's own
  precedent). Deliberately scoped narrower than a general JSON/full-text
  search — plan/16-security.md section 8 already draws that line: security
  events go to a SIEM for real investigation, `audit_event` is the durable
  structured record, not a search engine. No new DB index added yet (fine
  at ~600 rows; `action` has none today, worth adding before this gets to
  real production volume, not before). One correctness bug caught by its
  own test before it shipped: the first "to" implementation used `<=` on
  the parsed date-only string, which parses to that day's UTC midnight —
  so picking today as "to" would have silently excluded every row from
  today after 00:00 UTC, the opposite of what a "through this day"
  date-range control should do. Fixed with an exclusive upper bound one
  day later instead. Verified meaningfully at every layer: reverted the
  domain filter, the "to" fix, and the frontend's domain-tab wiring in
  turn and confirmed each specific test failed for the right reason before
  restoring; ran the full API integration suite (90 tests) and admin unit
  suite (128 tests) green; then walked it live through the running dev
  stack with a disposable Super Admin account (logged in for real via
  `DEV_AUTH_RELAXED`, no mocking) — confirmed Domain+Target-type combined
  correctly narrows to real staff-management history, free text on an
  invitee's email address matches both the row where they're the actor
  *and* the separate row where their email is the `targetId`, and an
  impossible date range (`to=2020-01-01`) correctly comes back empty
  rather than erroring — then cleaned up the disposable account after.
- 2026-09-16 — Three UI follow-ups on the Audit Log filter bar above, from
  the user actually looking at it once built. (1) Four filter controls
  sitting in the toolbar read as too much — moved Domain/Target
  type/From/To into a collapsible side panel, added a new `Drawer` family
  (`packages/ui/src/components/drawer.tsx`, exported alongside `Modal`):
  built on the *same* Radix `Dialog` primitive `Modal` uses (real focus
  trap, Escape, backdrop click-to-close — not a hand-rolled div like the
  sidebar's own mobile drawer), just positioned as a right-edge slide-in
  instead of a centered scale-in, since a filter panel is a distinct
  enough shape from a create/edit form to want its own primitive rather
  than a `Modal` variant prop. Search box and the "Clear filters" button
  (pushed to the row's far right via `ml-auto`, unchanged in place per the
  ask) stay in the always-visible toolbar; only the four filters moved
  behind the new "Filters" trigger. (2) Domain went from segmented tabs to
  a `<select>`, matching Target type's own control and reading better
  stacked vertically in the drawer than a button-row would. (3) A native
  `<input type="date">` only opens its picker from the small calendar-icon
  glyph by default — added an `onClick` calling `el.showPicker()`
  (feature-detected; a harmless no-op in a browser without it, e.g.
  Safari, which falls back to the native default) so clicking anywhere in
  the field opens it, matching how the rest of the control already reads
  as one clickable unit. Verified meaningfully: removed the `showPicker()`
  wiring and confirmed its test failed for exactly that reason before
  restoring it; the drawer's open/trigger/close wiring is exercised
  end-to-end by seven of the filter bar's fifteen tests (every one that
  needs the drawer open first calls a shared `openFiltersDrawer()` helper
  — if that wiring broke, most of the suite would fail with it, not just
  one dedicated test). Full admin suite (130 tests) and both packages'
  typecheck/lint stayed green throughout.
- 2026-09-16 — Two more Audit Log filter-bar follow-ups, both from the
  user actually using it. (1) "Clear filters" used `ml-auto` to sit at the
  toolbar's far right — at 767–830px the row wraps to two lines and
  `ml-auto` flings it onto an orphaned second line, disconnected from the
  Filters button (screenshot from the user caught this). Dropped
  `ml-auto`; it now just sits immediately after Filters and wraps together
  with it as one unit. (2) The user asked, unprompted, whether needing to
  close the filters panel before clicking back into the search box was
  real-world UX — it wasn't a vague complaint, it was a real, findable bug:
  the "drawer" from the entry above was `Drawer`, built on the same Radix
  `Dialog` primitive `Modal` uses, which defaults to `modal={true}` —
  focus-trapped and pointer-events-blocking on the rest of the page while
  open, i.e. clicking the search box while it was open did nothing at all,
  by design of the primitive, not by any explicit choice. Swapped to a new
  `Popover` primitive (`packages/ui/src/components/popover.tsx`, added
  `@radix-ui/react-popover` — same version series as the other Radix
  packages here) — Radix's `Popover` has no `Overlay`/backdrop primitive
  at all, so there's structurally nothing to block the rest of the page;
  clicking another control while it's open both dismisses the popover and
  reaches that control in the same interaction, matching how GitHub's
  Labels/Milestone dropdowns and Gmail's filter icon behave, not how a
  modal does. `Drawer` itself wasn't deleted — kept as a real,
  independent primitive for the shape it's actually suited to (a
  create/edit form, a bulk action — something meant to be used
  exclusively, not alongside a search box) — swapping `audit-log.tsx`
  between the two is a one-file, import-level change if the user's own
  UI test prefers the Drawer's look after all. Verified meaningfully, and
  this one had unusually concrete proof available: swapped back to
  `Drawer` temporarily and ran the new structural test — it failed by
  finding exactly the mechanism in question, a real DOM node:
  `<div class="fixed inset-0 ... " style="pointer-events: auto" data-aria-hidden="true">`
  covering the full viewport. `Popover` renders no such element at any
  point. Restored `Popover`; full admin suite (131 tests, 1 new) and both
  packages' typecheck/lint green.
- 2026-09-16 — Audit Log's Before/After panel switched from a full
  before/after dump to a diff: only the fields that actually changed,
  `field: old → new` (old struck through in `text-destructive`, new in
  `text-success`), instead of two full JSON blocks a reader has to eyeball
  field-by-field to spot the one that moved (a real screenshot showed a
  12-field category where only `name.en` differed). Discussed real-world
  precedent first: field-history/audit-log tools (Salesforce Field
  History, most admin activity logs) show only-what-changed; code/text
  diff tools (GitHub PRs, Notion/Docs revision history) show full content
  with changes highlighted; raw event logs (CloudTrail, Stripe events)
  dump the full payload with no diffing at all, because their job is
  proving exactly what was sent, not helping a human spot an edit. This
  page is the first category, not the third — landed on diff-only, not
  full-dump-with-highlighting, since the highlighting variant solves a
  problem (scanning a big block of mostly-identical text) that diff-only
  avoids having in the first place. New pure function `diffRecords`
  (`apps/admin/src/features/audit-log/diff.ts`, tested directly rather
  than only through the component, matching `reorder.ts`/`reorder.test.ts`'s
  own precedent in the sibling categories feature): flattens nested plain
  objects into dot paths (`name.en`), leaves arrays as one comparable unit
  rather than diffing per index, deep-equals leaf values, excludes `id`
  and `updatedAt` from the comparison — `id` can never differ on an update
  (it's the record's own key, already shown as the row's own `targetId`),
  and `updatedAt` changes on every write regardless of what else did, so
  including it would mean literally every diff, forever, carries at least
  one guaranteed-uninteresting line. A create or delete (only one side of
  before/after present) has nothing to diff *against* — every field there
  is the whole relevant state, not a change — so that case still renders
  the previous full, wrapped JSON dump; diffing only applies when both
  sides exist. An update where the only differences are the excluded keys
  now shows "Nothing else changed." rather than a blank, broken-looking
  list. Verified meaningfully: 10 direct unit tests on `diffRecords`
  (nested paths, array-as-a-unit, added/removed fields, `null` vs
  missing, exclusion, alphabetical ordering for determinism) plus updated
  component tests; emptied `EXCLUDED_KEYS` and confirmed 3 tests failed
  by finding `updatedAt` leaking into the rendered diff exactly as
  expected, then restored. Full admin suite (144 tests, 12 new) and
  typecheck/lint green throughout.
- 2026-09-16 — Two screenshots (768px, 900px) caught the Audit Log table's
  Target column and expand chevron getting cut off, not wrapped or
  scrolled, invisible and unreachable. Root cause: the table opted out of
  `Table`'s default `scrollX={true}` (using `scrollX={false}` →
  `overflow: clip`) specifically to keep its `sticky` header working —
  `overflow-x-auto` has a documented side effect of also forcing
  `overflow-y` to `auto`, which would trap the sticky header inside the
  table's own scroll box instead of the page's. That trade-off is correct
  at real desktop widths but backfires between 768–960px: the five
  `table-fixed` columns (Time 160px + Actor 208px + Action 208px + Target
  + the 40px chevron) don't all fit there, and `clip` means the overflow
  is silently discarded rather than reachable via scroll. Discussed three
  options (widen the table/card breakpoint; turn on `scrollX` and accept
  the sticky-header trade-off; reflow the column widths) — went with
  widening `hidden md:block`/`md:hidden` to `hidden lg:block`/`lg:hidden`
  on the table and card-list wrappers respectively: the card list already
  renders this same content correctly (time/actor/action/target
  stacked, same expand toggle), so the fix is redirecting the existing
  working layout to cover the zone the table doesn't fit, not building
  anything new. Verified meaningfully: reverted both wrappers back to
  `md:`, confirmed the new breakpoint-assertion test failed by finding the
  old class exactly where expected, restored. Full admin suite (145
  tests, 1 new) and typecheck/lint green.
- 2026-09-16 — Audit Log's filters (`q`/domain/targetType/from/to) now
  sync to the URL query string, matching Stripe's Events log and GitHub's
  issue search: a refresh, a back-button press, or a shared link reopens
  on the same filtered view instead of losing it. State is seeded from
  `useSearchParams()` once via each `useState`'s lazy initializer (a
  one-way read, not an ongoing binding), then a `useEffect` keyed on the
  filter values calls `router.replace` (never `push` — refining a filter
  isn't a new place to visit, it's adjusting the one you're on; `push`
  would pile up a history entry per keystroke/date-pick) to write them
  back out. Deliberately scoped to filter values only, not pagination —
  checked how Stripe/GitHub/Twitter handle this too: none of them restore
  scroll depth or cursor position from a URL either, a shared/refreshed
  link is expected to start from the top of that filtered view, which is
  already what a fresh mount does. An unrecognized `domain` value in the
  URL (hand-edited or stale) falls back to `'all'` rather than crashing or
  silently sticking. Verified meaningfully: reverted the lazy-init seeding
  back to plain empty defaults and confirmed exactly the two tests that
  depend on it failed (pre-fill-from-URL, and clear-filters starting from
  a pre-filtered URL) for the right reason, restored. Full admin suite
  (149 tests, 4 new) and typecheck/lint green. One honest gap: the actual
  browser URL-bar update is a client-side `router.replace` call with no
  server round-trip, so unlike the rest of this session's live checks it
  isn't curl-verifiable — needs a real browser look to confirm end-to-end.
- 2026-09-16 — Same URL-sync applied to Category List's `status`/`q`, on
  request after Audit Log's version above. Checked the component's actual
  state first rather than assuming: `collapsed` (tree expand/collapse) is
  already persisted, deliberately to `localStorage` not the URL — that's
  the right call as-is (it's view state, like scroll position, the same
  category Audit Log's own pagination cursor was kept out of the URL for)
  and this change doesn't touch it. Identical shape to Audit Log's:
  lazy-`useState` seeding from `useSearchParams()` once at mount, a
  `useEffect` on `[status, debouncedQ]` writing back via `router.replace`
  (never `push`), an unrecognized `status` value falling back to `'active'`
  instead of crashing or sticking. Verified meaningfully: reverted both
  lazy initializers to plain empty/`'active'` defaults and confirmed the
  pre-fill-from-URL test failed — the mocked Archived-tab response never
  got consumed because status silently stayed `'active'` — restored. Full
  admin suite (153 tests, 4 new) and typecheck/lint green. Same honest
  gap as Audit Log's version: the URL-bar update itself is client-side
  and not curl-verifiable, needs a real browser check.
- 2026-09-16 — A screenshot caught the "Active" status tab showing a row
  whose own Status badge read "Inactive," flagged as confusing. Not a
  logic bug — the tab is a lifecycle filter (`archivedAt == null`, per
  `plan/07-data-model.md`'s "catalog delete means archive" — the tab's
  own copy key doc-comments it as "which lifecycle slice"), a genuinely
  different axis from the Status column's `isActive` boolean, and a
  category can correctly be both "not archived" and "inactive" at once —
  the fixture that surfaced this was even named `FX Hidden but live
  (inactive)` for exactly that case. The actual bug was naming: `filter.
  active` and `status.active` in `catalog.json` were the literal same
  string, "Active," so the tab and the badge looked like they were
  claiming the same thing when they weren't. Renamed the tab to "Live" —
  keeps the `active` key (still maps to the same `CategoryListStatus`
  value), changes only the displayed word, distinct from the Status
  column's own Active/Inactive/Archived vocabulary. Left `archived`/`all`
  alone — an Archived-tab row showing an "Archived" badge is consistent,
  not confusing, so there's no collision to fix there.
- 2026-09-16 — Fixed the `AUDITLOG_READ` scoping gap flagged a few entries
  back: `packages/auth/src/permissions.ts`'s comment said Service Admin's
  grant was "partial in practice; scoped down in the read query," but
  `AuditController.list` never actually scoped anything — every row went
  to everyone with the permission. Decided the policy before touching
  code, from what was already written rather than guessing: plan/03
  section 4's permission matrix already lists `auditlog:read` as
  `partial | partial | full` for Service Admin/Admin/Super Admin (a
  single row using that convention nowhere else in the table), and
  section 3's role write-ups name exactly one thing as Super-Admin-
  exclusive here — "Staff management: invite/create/suspend/remove
  Admins and Service Admins." That maps precisely onto one concrete,
  already-`staff:manage`-gated set of actions (checked `staff.controller.ts`:
  every invite/role-change/activate/reset-totp/deprovision endpoint
  requires `STAFF_MANAGE`, which only `SUPER_ADMIN_PERMS` holds) — so
  "partial" = hide `identity.staff_invited/staff_invite_accepted/
  staff_role_changed/staff_activated/staff_deprovisioned/staff_totp_reset`,
  nothing else. Deliberately left visible to partial: general identity
  security events (login failures, MFA, session/token-reuse, password
  resets) and all catalog events — Service Admin's own "trust and safety,
  keeps eyes on the marketplace" remit needs that visibility even though
  it can't perform `staff:manage` actions itself. Implementation: added
  `Permission.AUDITLOG_READ_FULL` (`auditlog.full:read` — the codebase's
  own house rule is "business code checks permissions, never role
  strings," so this is a second permission Super Admin alone holds, not a
  role-name check in the controller), granted only in `SUPER_ADMIN_PERMS`;
  `AuditController.list` takes `@CurrentActor()` now and adds a `NOT IN`
  clause over the six actions when `can(actor, AUDITLOG_READ_FULL)` is
  false. Caught and fixed a real regression before it shipped:
  `permissions.test.ts` enforces a strict one-colon `resource:verb` key
  shape on every permission, which `auditlog:read:full` broke — renamed
  to `auditlog.full:read`, matching the same dotted-qualifier convention
  `coupon.platform:manage`/`seller.analytics:read` already use. Added a
  new "auditlog:read:full" row to plan/03's matrix and a short prose note
  spelling out concretely what "partial" excludes, so the next reader
  doesn't have to re-derive this decision from source. Verified
  meaningfully: reverted the exclusion to `if (false)` and confirmed
  exactly the 3 dependent tests failed (a 4th, "still sees everything
  else," correctly kept passing since it doesn't depend on the
  exclusion), restored; full API unit+integration suites (21 + 94) and
  `@shopnetic/auth`'s own suite (17, including the regression) green.
  Then re-seeded the dev DB (`db:seed` — idempotent upsert, confirmed
  "35 permissions" / "SUPER_ADMIN: 25 permissions", up from 34/24) and
  walked it live end-to-end: created a disposable Super Admin and a
  disposable Service Admin, logged in as each for real, hit the same
  `GET /api/staff-auth/audit-events` query as both — Super Admin's
  results included `staff_role_changed`/`staff_activated`/
  `staff_deprovisioned`/`staff_invited`/`staff_invite_accepted`; Service
  Admin's had none of them, while both saw identical `staff_login_failed`/
  `staff_session_created`/`staff_password_*` rows — then cleaned up the
  disposable accounts and rows after.
- 2026-09-16 — Added `@@index([action])` on `audit_event` (last of the
  deferred items from the Audit Log thread) — speeds up the Domain filter
  (`action LIKE 'catalog.%'`, a leading-wildcard-free prefix a btree index
  can range-scan) and the partial/full scoping's `NOT IN (...)`; doesn't
  help the free-text search's `LIKE '%token%'` (leading wildcard, needs
  `pg_trgm` + GIN instead — deliberately still out of scope). Migration
  generation (`prisma migrate dev`) surfaced a real, pre-existing, unrelated
  landmine: it also proposed `DROP INDEX "catalog"."category_path_gist_idx"`
  — a hand-managed raw-SQL GIST index on `Category.path` from an earlier
  migration that `schema.prisma` has no way to declare (`@@index` has no
  GIST option without the `extendedIndexes` preview feature, not enabled;
  the column is `Unsupported("ltree")` regardless, likely not targetable
  even with it on). Because it's genuinely invisible to Prisma's schema,
  it reads as drift on *every* migration, not just this one — confirmed by
  checking the live dev DB directly: the index really was gone after the
  migration applied. Not a one-time fluke to quietly patch — the same
  proposal reappeared from a fresh `prisma migrate diff` even after fixing
  this migration's own SQL, meaning any *future* migration (for anything,
  by anyone) will propose dropping it again. Fixed what's fixable now:
  recreated the index directly against the dev DB (`CREATE INDEX IF NOT
  EXISTS ... USING GIST`, confirmed via `pg_indexes`), edited this
  migration's own `migration.sql` to recreate it too (so a fresh
  `migrate deploy` on a clean DB doesn't lose it), and added a loud warning
  comment directly on `Category.path` in `schema.prisma` telling whoever
  generates the next migration to check for that exact `DROP INDEX` line
  before applying. The structural gap itself — Prisma can't represent this
  index, so the warning is the only guard until something more permanent
  is decided — is intentionally left open, flagged rather than silently
  routed around. Verified: full API integration suite (94 tests, including
  the category-tree subtree-op tests that exercise the GIST index's actual
  job) green after restoring it; typecheck/lint clean.
- 2026-09-16 — Deep-link from an Audit Log row's Target column to its live
  record. Scoped by auditing which admin pages actually exist rather than
  guessing: of the 13 `targetType` values `audit.record()` writes, only
  `category` (`/catalog/categories` exists) and `account` when
  `event.action.startsWith('identity.staff_')` (`/staff` exists; an
  unqualified `account` could also be a buyer/marketplace account, which has
  no admin page — the prefix check is exactly the boundary between the
  STAFF_MANAGE-gated staff actions and the self-service `identity.staff_*`
  ones, and never matches a non-staff account) have anywhere real to land.
  Everything else stays plain text. Lands as scroll-to + flash-highlight on
  the target row, not an auto-opened edit modal — Category has one canonical
  edit dialog but Staff List doesn't (only a `⋮` menu with consequential
  actions that shouldn't auto-fire), and the row itself plus the audit
  entry's own diff already answer "does it still exist / what changed";
  one more click (the existing Edit button) reaches full detail. URL shape:
  Category reuses its existing status/q URL-sync (`?status=all&highlight=id`
  — always forces `status=all` so the target is reachable regardless of its
  current archived state, and `highlight` falls out of the URL for free the
  first time that sync effect runs); Staff List had no URL-sync before, so
  `?highlight=id` gets a small dedicated `router.replace(pathname)` once
  handled. New shared `useFindById` hook (`apps/admin/src/hooks/
  use-find-by-id.ts`) progressively calls a cursor-pagination's `loadMore()`
  (bounded, 40 attempts) until the target `id` turns up or `hasMore` goes
  false — genuinely shared (unlike other accepted small duplication this
  project), since both call sites needed identical bounded-retry logic.
  Ported (not shared — Staff List had no equivalent) Category's existing
  `flash()`/`sn-row-flash`/`data-*-row` pattern into Staff List for its own
  highlight. Found and fixed a real bug via the usual revert-confirm-restore
  discipline: `useFindById`'s "is a fetch in flight" parameter first only
  covered `loadingMore` (a later page) — `useScrollLoad`'s own automatic
  first-page fetch is tracked by a separate `loading` flag, so the hook
  could call `loadMore()` before the first page resolved, firing two calls
  both with `cursor=undefined`. Renamed the parameter to `isBusy` and made
  both call sites pass `loading || loadingMore`; reverting Staff List's call
  site back to the old form reproduced the exact symptom (`loadMore` called
  twice with an unset cursor) in its integration test, confirming the test
  actually covers the bug, not just the happy path. Also verified the
  `account` staff-vs-non-staff gate the same way: temporarily dropped the
  `.startsWith('identity.staff_')` check, confirmed the "non-staff account
  stays plain text" test failed with the buyer/marketplace row wrongly
  linking to `/staff`, restored. Full admin suite green throughout (170
  tests / 19 files); typecheck and lint clean.
- 2026-09-16 — Added search to the Staff directory (`/staff` had none;
  Category List and Audit Log already did, and were the requested
  reference for the UI/UX to match). Server: `StaffAccountsService.list`
  takes an optional `q`, filtered as a plain Prisma `email: { contains,
  mode: insensitive }` — email is the only free-text field a staff account
  has (no name field on the model) — and, unlike `CategoryService.list`'s
  scored tree search, never re-ranks the page, so the cursor stays the
  same plain `id` bound with or without a search active (same reasoning
  `AuditController` already uses for its own `q`). `StaffController.list`
  passes `@Query('q')` straight through; no contracts change needed since
  list query params were never part of the Zod schema layer to begin with.
  Client: `SearchInput` + `useDebouncedValue` (250ms) + a URL-sync effect,
  matching Category List's/Audit Log's own pattern exactly — `?q=` seeded
  once at mount, `router.replace` (not `push`) on every debounced change.
  Consolidated with the existing `?highlight=` deep-link handling built
  the same day: previously the highlight-found effect did its own
  `router.replace(pathname)` once it located the target row, which would
  have silently wiped out an active `?q=` the moment a deep link resolved
  while a search was also typed. Removed that manual call — the new q-sync
  effect already strips `highlight` from the URL on its own first run
  (same as Category List's own comment on this exact mechanism explains),
  so there's nothing left to special-case. Also added the empty/no-match
  states the page never had (CODING-RULES E5) — zero results was
  previously unreachable before search existed, so its absence hadn't
  surfaced as a gap yet; `noMatch` (search active) is worded distinctly
  from `empty` (genuinely no staff), same split Category List already
  makes. Verified via revert-confirm-restore at both layers: reverting the
  Prisma `where` filter reproduced the exact failure (`ITEST-TARGET`
  wrongly also matching the Super Admin fixture) in the integration test
  against the real dev DB, restored; full admin suite (174 tests) and API
  integration suite (95 tests, live DB) green; typecheck/lint clean on
  both packages. Browser-level check left to the user, same caveat as
  every other client-rendered feature this session — logging in as a
  disposable Super Admin to exercise the endpoint over curl would need
  scripting TOTP enrolment/confirmation just for this, out of proportion
  to a one-line `@Query('q')` passthrough that's already covered against
  the real database at the service layer.
- 2026-09-16 — Two Staff List follow-ups from a live browser check of the
  search just shipped:
  1. **Search matched the literal query as one substring, not by word** —
     a user report: `"  shoaib  shopnetic  "` should match an email
     containing *either* word, with the stray spaces just trimmed away, not
     compared literally. `StaffAccountsService.list`'s single Prisma
     `email: { contains: q }` did neither (it would look for that exact
     padded, unsplit string). Replaced it with the same `tokenizeForSql` +
     `OR`-across-tokens shape `CategoryService.list`/`AuditController`
     already use (duplicated per their own established precedent of not
     sharing this across files) — normalize, split on whitespace/
     punctuation runs (dashes included, so an email's own `-`/`.`/`@`
     don't need special-casing), `OR` a `contains` per token. A real
     behavior consequence worth noting: because the tokenizer also splits
     on punctuation, a hyphenated query like `"itest-target"` now
     tokenizes into `["itest", "target"]` and matches *any* email
     containing either word, not just one containing the literal
     substring `"itest-target"` — correct per the ask, but it did
     invalidate the previous day's test's assumption that a hyphenated
     fragment discriminates between two fixtures sharing a common prefix;
     rewrote it against words that are each unique to one fixture instead.
     Verified via revert-confirm-restore: reverting to the old single-
     `contains` form reproduced the exact failure (the multi-word OR test
     going from matching both fixtures to only one), restored; API
     integration suite green (96 tests, live DB) throughout.
  2. **The Role column crowded Email in the `md`–`lg` band** — between
     768–1023px the table's fixed-width Role/Status/Authenticator columns
     left too little room for Email, which the same viewport's mobile
     card fallback below `md` doesn't have this problem with (Email is
     the only thing on its own line there). Same fix `category-tree.tsx`'s
     Brand column already uses for the identical class of problem: `hidden
     lg:table-cell` on Role's header and cell — dropped in that band with
     no inline fallback (G7: the row and the Edit modal still have it),
     reappears at `lg`+. Verified structurally via revert-confirm-restore
     (jsdom doesn't apply real responsive breakpoints, so the test can
     only assert the class is present, not that it visually collapses at
     a given width) — reverting the class change failed the new test as
     expected, restored. Full admin suite (175 tests) green; typecheck/
     lint clean on both packages.
- 2026-09-16 — Fixed an inconsistent Staff sidebar-group collapse, reported
  from a live browser check: clicking the "Staff" group header to collapse
  it while already on `/staff` (or `/staff/invite`) visibly did nothing,
  and afterwards, navigating to an unrelated page sometimes left the group
  collapsed and sometimes left it expanded, depending on how many times the
  header had been clicked while on that page — with no visible feedback in
  between to explain why. Root cause: `sidebar.tsx`'s `NavItemRow` rendered
  `isOpen` as `expanded || anyChildActive`, and the header's `onClick`
  always flipped `expanded` regardless. While a child of the group is the
  active route, `anyChildActive` alone already forces `isOpen` true, so a
  click there has no visible effect — but it silently keeps toggling the
  hidden `expanded` bit anyway, and *that* bit is what decides `isOpen`
  once `anyChildActive` goes back to false after navigating away. The
  post-navigation state was really just that bit's parity — invisible while
  it was accumulating, surprising once it mattered. Discussed two ways to
  make it deterministic (always collapse on leaving vs. always stay open,
  regardless of click count) and picked neither literally: instead, the
  header's `onClick` is now a no-op while `anyChildActive` is true, so
  `expanded` only ever changes from *outside* the section — clicking it
  any number of times while inside has zero effect, visible or hidden, and
  leaving the section always reflects whatever it was explicitly set to
  before entering (collapsed if it was never touched, open if it was
  explicitly opened from elsewhere and not later explicitly closed from
  elsewhere). Simpler than picking an arbitrary fixed rule, since it
  removes the parity bug at its source rather than working around its
  symptom. New regression tests in `admin-shell.test.tsx` needed to
  simulate a same-shell client-side navigation (`AdminShell` never remounts
  on a real route change, only `pathname` changes) — RTL's `rerender`
  reconciles against the *previous* root, so it has to be called with the
  exact same provider wrapper the initial render used or React swaps the
  root element type and force-remounts, silently resetting `useSidebar`'s
  state and defeating the test. Extracted that wrapper out of
  `test/render.tsx`'s `renderAdmin` into a newly-exported
  `AdminTestProviders`, reused by both the initial `render` and every
  `rerender` call. Verified via revert-confirm-restore: reverting the
  `onClick` guard reproduced the exact reported symptom (three clicks while
  active — an odd count — left the group open after navigating away, when
  it should have gone back to closed), restored; full admin suite (177
  tests) green; typecheck/lint clean.
- 2026-09-17 — Whitespace-only search fix, then a full codebase-wide DRY/
  reuse audit and cleanup (user-requested, four batches run in parallel).
  - **Whitespace-only query bug** (found live: typing "   " into Staff
    List's search box showed a skeleton-then-rows cycle for a query that
    was never actually a search). Root cause: `debouncedQ` fed both the
    server request and `useScrollLoad`'s `resetKeys`/the URL-sync effect
    directly — a whitespace-only string still counts as "changed" even
    though it's not an effective search. New `apps/admin/src/hooks/
    use-debounced-search.ts` composes the existing generic
    `useDebouncedValue` and `.trim()`s the result — the raw `q` state
    feeding the visible `<SearchInput>` stays untouched (never fight the
    user's keystrokes, including the earlier "match any word, trim stray
    spaces" search behavior), only the derived copy used for reload/URL/
    server decisions is trimmed. Category List, Staff List, and Audit Log
    all switched from `useDebouncedValue(q, 250)` to `useDebouncedSearch(q)`.
  - **Audit scope**: user asked to check the *whole* monorepo, not just
    admin. Four read-only audits ran in parallel (apps/admin, apps/api,
    storefront+seller+cross-app, packages/*+small worker apps), each
    calibrated against two known examples from this session — the
    debounce-trim fix above (genuine same-app duplicated logic, worth
    extracting) and `tokenizeForSql`'s deliberate 3x duplication across the
    admin/api package boundary (small, cross-runtime, correctly left alone)
    — so "looks like repeated code" wasn't conflated with "worth an
    abstraction." Findings were presented to the user before any code
    changed; they approved all four implementation batches. Four parallel
    forks then implemented, each restricted to disjoint files:
  - **apps/admin** (6 items, all wired into Category List/Staff List/
    Audit Log/the invite form's cookie routes): `apps/admin/src/lib/
    api-route.ts`'s `parseJsonBody()` replaces the identical "Zod-validate
    the body or 422" block that was copy-pasted into all 7 `/api/
    staff-auth/*/route.ts` handlers, and `session-cookie.ts`'s new
    `applyAuthCookies()` folds in the 3 handlers that also repeated
    "set both cookies on success." `components/crud/scroll-load-states.tsx`
    (`ScrollLoadError`/`ScrollLoadSkeleton`/`ScrollLoadFooter`) replaces the
    load-error/skeleton/footer JSX all three list pages hand-rolled —
    Category List keeps its own top-level error/skeleton (a genuinely
    different tree-shaped skeleton + dual tree/flat mode) but shares the
    footer. `hooks/use-url-params-sync.ts` replaces each page's own
    "build URLSearchParams, skip falsy values, `router.replace`" effect
    (a plain object of param→value-or-falsy in, everything else handled —
    including the "a fresh object literal every render" dep-array gotcha,
    solved by keying the effect on `Object.values(params)` instead of the
    object itself). `hooks/use-row-flash.ts` replaces Category List's and
    Staff List's own copies of the flash-highlight-and-scroll mechanism
    (`data-*-row` attribute name is now a parameter) and fixes a real small
    bug for free: Staff List's hand-rolled copy was missing the H7 mount-
    safety guard (`if (mounted) setFlashId(null)`) Category's had, so
    navigating away within the 1400ms flash window risked a `setState`
    after unmount — the shared hook has the guard unconditionally, with a
    dedicated regression test (mount, flash, unmount, advance the timer,
    assert no console.error). `lib/format.ts`'s `capForMessage()` (default
    max 60, matching G7's documented value) replaces the identical
    truncate-for-a-toast/dialog one-liner duplicated as `clip`/
    `capForMessage` with two different magic-number defaults.
  - **apps/api** (5 items): `audit/audit-record-for.ts`'s `auditRecordFor()`
    factory replaces the byte-identical 17-line audit-wrapper method 7
    catalog services each defined (differing only in a hardcoded
    `targetType` string) plus `category.service.ts`'s 6 inline calls of the
    same shape; also dropped `!== undefined` guards the 7 wrappers
    duplicated needlessly on top of guards `AuditService.record()` already
    does internally. `common/request-meta.ts` replaces an identical
    `meta(req)` helper duplicated across 9 catalog controllers.
    `common/pagination.ts`'s `clampLimit()`/`paginate()` replace a
    `slice`+`nextCursor` pattern duplicated 3x and a `clamp()`/inlined-
    equivalent duplicated 5-6x. `envelope.ts`'s `ok()` now accepts an
    optional extra-meta argument, so `category.controller.ts` and
    `audit.controller.ts` no longer each reimplement their own
    request-id/count/nextCursor envelope construction by hand.
    `product-option.service.ts`'s audit call genuinely differs (no
    `action` param, a composite target id, a fixed action string) — kept a
    thin local wrapper delegating to the shared factory rather than forcing
    a non-fitting shape onto it.
  - **Cross-app** (storefront ↔ admin, 3 items, new package): both apps had
    independently hand-built byte-identical `postJson`/`getJson` (storefront
    lacked `getJson`) and `extractErrorCode`, and near-identical Set-Cookie
    parsers differing only in the hardcoded cookie name (`sn_rt` vs.
    `sn_srt`). New workspace package `@shopnetic/http-client`
    (`packages/http-client`, modelled on `packages/auth`'s structure, its
    own 13 unit tests) now owns all three; each app's own file re-exports/
    thin-wraps the shared implementation under its existing names so none
    of the ~30 call sites across both apps needed touching. App-specific
    bits (each app's own error-code-to-message table, each cookie's literal
    name) stayed local — this wasn't a merge of the two apps' auth
    architectures, just the handful of genuinely identical low-level
    utilities underneath them.
  - **packages/ui** (1 item): `lib/overlay-parts.tsx` (`OverlayCloseButton`,
    `DialogHeader`, `DialogTitle`) replaces the close-button/header/title
    boilerplate `Modal`/`Drawer`/`Popover` each duplicated almost verbatim —
    pure internal dedup, every component's public export name and rendered
    output stays identical (`ModalHeader`/`DrawerHeader`/etc. are now
    re-exports of the shared implementation, which only changes what React
    DevTools labels them as, not anything rendered or behavioral).
  - **Verification**: every batch ran its own revert-confirm-restore on at
    least its highest-blast-radius change (the mount-safety fix, the
    `auditRecordFor` `targetType` wiring, the `parseSetCookie` cookie-name
    parameterization, the close-button `aria-label`) before reporting done.
    One fork (apps/admin) was cut off mid-report by a session rate limit;
    its actual code changes were already complete and correct — verified
    independently afterward rather than re-run, since re-doing finished,
    already-tested work would have been wasted effort. Final full sweep,
    all green: `@shopnetic/admin` 198 tests / typecheck / lint;
    `@shopnetic/api` 25 unit + 96 integration (live dev DB) / typecheck /
    lint; `@shopnetic/ui` typecheck / lint (no runtime tests of its own;
    verified instead via every admin/storefront consumer's own suite
    staying green); `@shopnetic/storefront` 5 tests / typecheck / lint;
    `@shopnetic/http-client` 13 tests / typecheck / lint. The new package's
    build-pipeline wiring was double-checked separately: `dist/` is
    gitignored like every other workspace package, and root-level `pnpm
    build`/`dev`/`test`/`typecheck` all run through `turbo run <task>`,
    whose `dependsOn: ["^build"]` already builds any workspace dependency
    (including a brand-new one) before its consumers run — nothing
    package-specific needed adding to `turbo.json`.
- 2026-09-17 — Post-sweep manual UI pass (real MFA login with
  `DEV_AUTH_RELAXED=false`, change/reset/forgot password, invite/accept-
  invite, Modal/Drawer/Popover, the three list pages) surfaced three real
  items, two fixed same day, one scoped and fixed as its own piece of work:
  1. **`AcceptInviteForm` had no Confirm Password field** — the only one of
     the three password-setting forms (Change/Reset/Accept) without one.
     Brought in line with `ResetPasswordForm`'s exact pattern: local
     `formSchema` (`staffInviteAcceptRequestSchema.omit({token:true})
     .extend({confirmPassword}).refine(...)`), a second `PasswordInput`,
     the existing `fields.confirmPassword`/`fields.passwordsDontMatch`
     translation keys (no new copy needed). Verified via revert-confirm-
     restore (broke the `refine`, confirmed the new mismatch test failed
     for the right reason — an unmocked `postJson` call fired — restored);
     13/13 tests in that file, 199/199 admin suite.
  2. **Modal/ConfirmDialog opened and closed with an instant snap** — a
     known, already-documented G11 gap (Drawer and DropdownMenuContent had
     the fade/slide treatment; Modal never did). Added the panel-scale
     (duration-300, per G11's own tier split — not `.sn-popover`'s
     150/100ms popover-scale) fade+scale, keyed off Radix's own
     `data-state` the same way `DrawerContent` already does it — overlay
     fades, content fades+scales. `ConfirmDialog` is built directly on
     `Modal`/`ModalContent`, so one change fixed both. New regression test
     in `staff-list.test.tsx` (jsdom can't run the actual transition, so it
     asserts the class wiring, same approach the sidebar chevron test
     already uses) — reverting the new classes failed it for the right
     reason, restored; 200/200 admin suite, `@shopnetic/ui` typecheck/lint
     clean.
  3. **Category flat/paginated view (Archived/All) ordered siblings by the
     ltree `path`, not drag `position`** — reported live: a category dragged
     to the top of Active showed up at the bottom of All. Root cause: the
     active tree's own client-side `buildForest` already re-sorts every
     level by `position` (documented), but the flat, paginated view has no
     equivalent — it rendered rows in raw SQL order, and `path`'s labels are
     the row's own stripped uuid (`label()`), carrying no relationship to
     `position` at all, so sibling order there was effectively random.
     Discussed as its own scoped task before writing code (per the standing
     "discuss big batches first" rule) — the real fix turned out to be more
     architecturally coupled than a typical bug: `path` is load-bearing for
     this view's gap-free `path > cursor` pagination, and it's `path`
     staying untouched by a plain reorder (only a reparent rewrites it) that
     keeps reordering cheap; encoding position into `path` itself, or into a
     second materialized column, would flip that — every reorder would need
     a whole-subtree rewrite instead of a handful of sibling rows, on a
     schema area (`path`/ltree/GIST index) already flagged fragile from the
     09-16 index-drift incident. Fetching everything and sorting client-side
     (what the tree already does) was ruled out too — that's exactly what
     the 09-15 pagination work was built to avoid for a large archived
     history. Landed instead as a **read-time-only** fix, `CategoryService`'s
     new `listRankedFlat`: a recursive CTE walks the real, unfiltered
     parent/child structure and computes each row's `rank_path` (an int
     array of `[ancestor position, …, own position]`) — the same shape
     `buildForest` produces, computed in SQL instead of client-side since
     this view can't fetch the whole table to sort locally. A row whose
     immediate parent doesn't satisfy the current status filter restarts its
     `rank_path` at just its own position — matching `buildForest`'s
     "parent missing from the result → orphan, shown at root" rule for the
     case that can't happen on the always-complete active tree but routinely
     does here (a category archived while its parent stays active). No
     schema change, no migration, no touch to reorder/reparent/move at all —
     purely additive to this one query, gated to exactly the case that had
     the bug (`paginated && parentId === undefined && !isSearch`; a
     `parentId`-scoped listing is already a single flat sibling level,
     directly `position`-orderable, no walk needed). Trade-off, accepted
     deliberately: this case's pagination is now offset-based, the same
     weaker (not gap-free) guarantee the search case already lives with —
     traded the strict guarantee for correctness on the property that
     actually matters here (visible order matches drag order). Three new
     integration tests (reorder into a deliberately-scrambled-relative-to-
     path sequence, confirm the flat view returns exactly that sequence;
     nested parent/child with an explicit reorder; the archived-child/
     active-parent orphan case) plus the two new tests' revert-confirm-
     restore (temporarily forced `rankedFlat = false`, both new order tests
     failed with the exact scrambled-order symptom, restored). Full API
     suite green throughout (99 integration incl. 3 new + the pre-existing
     14, 25 unit); admin suite unaffected (200/200, no client change needed
     — same response shape, just correctly ordered). Docs: this file, plus
     the categories feature README's Ordering section and its pagination-
     cursor-shapes paragraph, both updated to describe the new behavior
     rather than just flag the old gap.
- 2026-09-17 — Two more from the same post-sweep UI pass, plus a "should
  this even change" question that turned out to be a non-issue:
  1. **Not a bug, confirmed after checking**: the category "moved" toast's
     dark background vs. the "updated" toast's light green one. Checked
     `packages/ui/src/components/toast.tsx` — `notify.undo` (drag-move) is
     deliberately the dark Gmail-style variant (CODING-RULES G8/G9); every
     other toast in the app (`notify.saved`/`error`/`info`) is the light
     `BarToast`. Audited all 13 `notify.*` call sites in `apps/admin/src`:
     the split is applied consistently — every action that actually offers
     an Undo button is dark, nothing else is. No change made.
  2. **The "load more" footer showed a bare left-aligned `<p>Loading…</p>`**
     — functional but inconsistent with the app's own established "an
     async action is happening" idiom (`<Spinner />` + text, already used
     by Reset Password/Accept Invite's "Checking your link…"). Per this
     file's own E4 ("skeletons for first load, spinners for actions") —
     appending a page to an already-visible list is an action, not a first
     load, so a skeleton row was ruled out too (and would've meant a
     different skeleton shape per page, breaking `ScrollLoadFooter`'s
     whole point of being one shared, shape-agnostic component across
     Category/Staff/Audit Log). Centered `<Spinner />` + the same text.
     New regression test (`staff-list.test.tsx`) using a controllable,
     not-yet-resolved second-page promise to assert the spinner (`role=
     "status"`) appears while a later page is genuinely in flight and
     disappears once it resolves. Verified via revert-confirm-restore.
  3. **Login page's title sometimes rendered visibly before the form** —
     root-caused, not just patched. `login/page.tsx` was the *only* file
     in the whole admin app using `<Suspense>` — `StaffLoginForm` called
     `useSearchParams()` (for the post-login `?next=` redirect), which
     Next's App Router requires wrapping in Suspense; the page's own
     `<h1>` sat outside that boundary, and the boundary's `fallback={null}`
     meant a real gap — title paints as part of the static shell, form
     pops in later once the boundary resolves, timing (hence "sometimes")
     depending on hydration speed. Audited every other page for the same
     shape first (per the standing "check before assuming it's isolated"
     habit): Category List/Staff List/Audit Log each render their own
     title *inside* the same client component as their list, so there's
     no static-shell/Suspense split to gap in the first place; Reset
     Password and Accept Invite already resolve their own `?token=`
     *server-side* in `page.tsx` and pass it down as a plain prop, which
     is exactly the fix Login was missing — it was the one page that
     didn't follow the pattern the other two auth pages already got
     right. Fixed the same way: `page.tsx` now reads `next` from its own
     `searchParams` prop and passes it into `StaffLoginForm` as `next:
     string | null`; the component no longer calls `useSearchParams()` at
     all, and the `<Suspense>` wrapper is gone — title and form are back
     to rendering as one atomic server-rendered unit, same as every other
     page. Test file updated to pass `next` via the render helper instead
     of a mocked `useSearchParams().get()`. Verified via revert-confirm-
     restore (temporarily hardcoded the redirect destination, the existing
     "honors a path genuinely inside the admin root" test failed for the
     exact right reason, restored). Full admin suite green throughout
     (201 tests, +1 from the spinner regression test); typecheck/lint
     clean.
- 2026-09-17 — Two more small discussion-first items:
  1. **`AcceptInviteForm`'s dead-token screen paired a mismatched title with
     the error.** "Accept your staff invite" sitting above "This invite link
     is invalid." reads oddly — that title names the exact action this
     screen exists to say isn't available. Dropped the separate title; the
     error message is now the screen's one `<h1>` (still `text-destructive`
     + `role="alert"`, same accessibility behavior as before — announces to
     screen readers, just no longer also exposing an implicit `heading`
     role, since an explicit ARIA role replaces the native one rather than
     stacking with it; the new regression test queries `role="alert"`
     accordingly, not `role="heading"`). Explicitly **not** changed: the
     "already accepted" state stays its own richer screen (title +
     explanation + auto-redirect) — discussed first, decided the two cases
     genuinely differ (one is a known-safe "you already did this," the
     other is a genuine unknown, so auto-redirecting there would be
     presumptuous) rather than collapsing them into one generic message.
     Checked every other auth page for the same "title above a dead-link
     message" shape before treating this as isolated: `ResetPasswordForm`
     had the identical pattern (fixed the same way); Login has no
     token-based invalid/expired state; Forgot Password's link is never
     itself consumed/validated so it has no such state; Change Password is
     an authenticated in-session action, no token involved. Verified via
     revert-confirm-restore on the Accept Invite side (reverted to the old
     two-element form, the new "no separate title" test failed for the
     exact right reason, restored). Full admin suite green (201 tests);
     typecheck/lint clean.
  2. **Discussed, decided not necessary (for now): `redirectIfSignedIn`'s
     silent bounce-to-dashboard.** Reported scenario: a signed-in browser
     clicking an invite/reset link (their own or someone else's) gets
     silently redirected to the dashboard with zero explanation, and —
     since every one of Login/Forgot Password/Reset Password/Accept
     Invite carries the same guard — there's no page reachable from that
     bounce that would let them sign out and retry, short of already
     knowing to use the Account menu. The guard's underlying reasoning is
     sound and stays as-is (the session cookie is shared browser-wide, not
     per-tab, so silently letting the page load would swap sessions onto
     whatever account the link belongs to) — what's missing is an
     interstitial ("You're signed in as X — continue to dashboard, or sign
     out to use this link") instead of the blind redirect, the pattern
     bigger products use for this exact situation. Judged not necessary
     right now: this is an internal tool for a small set of trusted staff,
     and the token itself isn't consumed by a blocked visit (it stays
     valid — nothing is lost, just some confusion in a narrow, low-
     frequency scenario), with a recoverable-if-non-obvious path out via
     the existing Account → Sign Out. Left as a known, deliberately-
     deferred gap rather than built now — revisit if it becomes a real
     recurring complaint, at which point it's a real (if small) feature
     touching all four pages via the shared guard, not a quick patch.
- 2026-09-17 — Reported: "Forgot your password?" had a hover effect, "Back
  to sign in" on the invite-invalid screen didn't. Audited every plain
  inline link in `apps/admin/src` (not nav items or menu items — those have
  their own `hover:bg-muted` treatment, a different idiom entirely) and
  found the same drift repeated ~11 times: `underline underline-offset-2`
  with or without `text-muted-foreground hover:text-foreground` tacked on,
  inconsistently, because every call site imported `next/link` directly and
  hand-rolled its own className with nothing sharing the definition — the
  "form" screens' back-links happened to get the hover treatment, the
  "message" (done/invalid/expired/already-used) screens' didn't, plus one
  outlier (`login-form.tsx`'s "Accept an invite") with a bare `underline`
  and no offset or hover at all. Root cause matched `plan/CODING-RULES.md`
  D1 exactly — `Link` is one of the primitives that rule already says
  should have a thin `@shopnetic/ui` wrapper, and never got one. Built it:
  new `packages/ui/src/components/link.tsx`, a `next/link` wrapper
  defaulting to `underline underline-offset-2 text-muted-foreground
  hover:text-foreground`, `className` merged on top via `cn`/tailwind-merge
  so each call site keeps its own size/position utilities. Required adding
  `next` as a peer + dev dependency to `@shopnetic/ui` (previously had zero
  `next` imports anywhere in the package) — all three apps that consume it
  (admin, storefront, seller) are Next apps already, so this just makes
  explicit a dependency that was implicitly fine. Updated all ~11 call
  sites across `login-form.tsx`, `forgot-password-form.tsx`,
  `reset-password-form.tsx`, `accept-invite-form.tsx`, and
  `change-password-form.tsx` to import `Link` from `@shopnetic/ui` instead
  of `next/link` directly, dropping the now-redundant underline/color/hover
  classes from each. Deliberately **not** touched: Audit Log's Target-
  column deep-link (a dense table cell — underlined *only* on hover by
  design, the opposite default, to avoid every row reading as a link at
  rest) and the sidebar/topbar nav and menu links (their own established,
  non-underline hover idiom). New/extended regression tests across five
  test files assert the shared `hover:text-foreground` class specifically
  — surfaced a real, unrelated test-infra gap along the way: three test
  files' own `next/link` mocks only forwarded `children`/`href`, silently
  dropping `className` (and every other prop) instead of spreading the
  rest, so a hover-class assertion against them would have falsely reported
  "missing" even after the fix — updated those three mocks to spread
  `...rest`, matching the already-correct pattern `admin-shell.test.tsx`'s
  own mock used (its own comment already explains exactly why: "forwards
  aria-current/onClick/etc, not just href"). Verified via revert-confirm-
  restore on the shared component itself: temporarily dropped
  `hover:text-foreground` from `link.tsx`, all 5 of the new/extended
  assertions failed for the exact right reason across every affected file,
  restored. Full admin suite green (202 tests, +1 new file); `@shopnetic/ui`
  and `@shopnetic/storefront` typecheck/lint/test all clean too (storefront
  doesn't consume the new `Link` yet, but shares the package it now lives
  in).
- 2026-09-17 — Removed Login's "Have an invite link but ended up here?
  Accept an invite" hint — asked "will `/accept-invite` be functional
  later" while looking at it, which surfaced that the link itself was
  dead: `href={`/${locale}/${basePath}/accept-invite`}` with no `?token=`
  at all, so clicking it could only ever land on `status: 'invalid'`
  (checked client-side, before even calling the check endpoint) — the
  opposite of helpful for someone who actually has a real invite. No fix
  was viable in place: a token is required and there's no self-service
  "resend my invite" flow (inviting is Super-Admin-only), so there was
  never anywhere useful this link could route to. Removed the `<p>`, both
  now-unused `staff.json` keys (`login.inviteHint`/`inviteLink`), and
  updated the test that had asserted its hover state to instead assert
  neither the text nor the link render at all. Verified via revert-
  confirm-restore (temporarily re-added the dead link, the new "no longer
  offers a dead-end link" test failed for the exact right reason,
  restored). Full admin suite green (203 tests); typecheck/lint clean.
- 2026-09-17 — Reported live: an audit row's expanded JSON showed a
  category's reorder as raw uuids (`orderedIds`, `movedIds`, `parentId`) —
  unreadable without cross-referencing ids by hand. Root cause: most audit
  rows record an entity's *own* fields (`name`, `slug`, `role`) which are
  already human-readable; these three record a *relationship to another
  row* using its id, because that's what the service had on hand at write
  time, and nobody resolved it to a name. Fixed by snapshotting the
  referenced row's name into the payload alongside its id, at write time —
  matching how every other audit row already works (a snapshot of what
  something was called *then*, not a live lookup that'd silently drift if
  the row is later renamed). Three call sites:
  - `category.service.ts` `move()` — new `parentName` alongside `parentId`
    in both `before`/`after`. Needed a lookup for both the old and new
    parent (a new `nameOf(id)` private helper, no `deleted_at` filter since
    the referenced row could itself be archived later and the name at
    write time is still correct to show).
  - `category.service.ts` `reorder()` — new `parentName`/`orderedNames`/
    `movedNames` alongside their `*Id`/`*Ids` counterparts. Free — the rows
    for every id in `orderedIds` are already loaded (`byId`, fetched to
    validate the request), just weren't being read from.
  - `brand.service.ts` `merge()` — new `mergedIntoBrandName` alongside
    `mergedIntoBrandId`, and the free-text `reason` field switched from
    `merged into ${target.id}` to `merged into ${target.name}`. Also free —
    `target` was already the full loaded row.
  New/extended integration tests for all three, asserting the actual
  `audit_event.after`/`before` JSON directly (not just the service's return
  value) — the first tests in this codebase to inspect an audit row's raw
  payload shape rather than just that an event fired at all. Verified via
  revert-confirm-restore on each of the three independently — all failed
  for the exact right reason, restored. Full API suite green (101
  integration incl. 3 new, 25 unit); typecheck/lint clean.
  - **Asked to check for the same pattern elsewhere** — a background audit
    of every `record()`/`audit.record()` call site across every catalog/
    identity service found more, not yet fixed, roughly by cost: free
    (row already in scope, unused) — `option-type.service.ts`'s
    `updateValue()`/`removeValue()`, `product-option.service.ts`'s
    `setValues()`; needs one new small lookup —
    `product-option.service.ts`'s `remove()`, `value-set.service.ts`'s
    `addItem()`/`removeItem()`, `media.service.ts`'s `putTag()`/
    `removeTag()`, `brand.service.ts`'s `removeAlias()` (doesn't even fetch
    the alias before deleting it — the text itself isn't in scope, not
    just unread), `category-option.service.ts`'s `remove()`; bigger/
    structural — `category.service.ts`/`product.service.ts`/
    `variant.service.ts`'s own `toView()` functions embed a raw
    `parentId`/`categoryId`/`brandId`/etc. with no name, reused by every
    create/update/delete call site at once, so fixing the shared function
    (not a call site) is the real fix there — `variant.service.ts`'s case
    is the worst of these, since a variant's `selections[]` (e.g. "Color:
    Red, Size: Large") are exactly what someone reading the log would want
    readable and are currently two raw ids per selection with zero
    resolution. Checked and confirmed not applicable: every
    `identity/*.service.ts` payload (sessions have no human label to show;
    everything else is already a literal readable value or the row's own
    target id, already resolved via the Target column's deep-link).
    **Asked to do all of it, including the "bigger" cases — implemented
    2026-09-17.** The "bigger/structural" ones were *not* done by actually
    editing `toView()` (that still builds the public API-contract shape;
    a name field still has no business joining onto it) — instead every
    create/update/remove/restore call site on `category.service.ts`,
    `product.service.ts`, and `variant.service.ts` got the same
    `{ ...view, extraNameField }` spread the first three fixes already
    used, just repeated at every one of their call sites instead of
    once inside a shared function. Same outcome (every audit row on these
    three entities now reads name-enriched), same non-negotiable boundary
    (public contract types stay untouched) — "fix the shared function"
    from the earlier note turned out to mean "repeat the established
    per-call-site pattern more times," not "change what `toView()`
    returns." All nine remaining call sites landed the same way:
    `option-type.service.ts` (`updateValue`/`removeValue` → value code
    before/after), `product-option.service.ts` (`setValues`/`remove` →
    option-type code), `value-set.service.ts` (`addItem`/`removeItem` →
    option-value code, via a new `codeOf()` helper), `media.service.ts`
    (`putTag`/`removeTag` → option-type + option-value code, `putTag`'s
    was free since its existing-value lookup already carried both once
    widened past `id: true`), `brand.service.ts` (`removeAlias`, changed
    from a blind `deleteMany` to fetch-then-delete so the alias text is
    even in scope), `category-option.service.ts` (`put`/`remove` →
    category name + value-set name), `category.service.ts`
    (`create`/`update`/`remove`/`restore` → `parentName`, on top of the
    `move`/`reorder` ones already fixed), `product.service.ts`
    (`create`/`update`/`remove` → `categoryName`/`brandName`;
    `proposedBySellerId` deliberately left a bare id — no seller-facing
    name concept exists yet, nothing to snapshot), `variant.service.ts`
    (`create`/`update`/`remove` → `productTitle` + resolved
    `selections[]` with each `optionTypeCode`/`optionValueCode`, via a
    new `selectionLabels()` helper — the worst offender, now fixed).
    New/extended integration tests for all nine files, asserting the raw
    `audit_event.before`/`after` JSON directly. Verified via
    revert-confirm-restore on the two highest-value fixes (variant's
    `selections`/`productTitle`, category's `parentName`) — both failed
    for the exact right reason with the fix reverted, restored, reconfirmed
    green. Full API suite green (109 integration incl. 8 new, 25 unit);
    typecheck/lint clean.

- 2026-09-17 — Discussed and started the Brands admin feature (backend
  layer first, admin UI to follow). Two decisions made before touching
  code:
  - **`is_restricted` (counterfeit-prone flag, plan/26 §brands) is a new
    boolean column, not a 4th `status` value.** `status`
    (`pending`/`active`/`rejected`) answers "is this brand approved to
    exist"; restricted answers "does a listing under it need extra
    verification" *while* active — the common real case is a fully
    approved, actively-sold brand that's also frequently counterfeited.
    Folding it into `status` would make "active and restricted"
    unrepresentable and lose information the moment it needs to be
    un-flagged. New migration
    `20260917105603_brand_is_restricted` (plain `ALTER TABLE ADD COLUMN
    ... DEFAULT false`, applied via `prisma migrate deploy` since
    `migrate dev` needs a TTY this environment doesn't have — the
    migration folder + SQL were written by hand in the same style as the
    existing ones, then applied and the client regenerated). Not consumed
    by anything downstream yet (no listing-moderation flow exists) — the
    column and the admin toggle exist so it's available when that flow is
    built.
  - **Brand delete is soft-only** (matches plan/25 row 116), but auditing
    `remove()` against that same doctrine surfaced a real bug: it set
    `deletedAt` and stopped, with no guard for products still referencing
    the brand — contradicting plan/26 §brands' explicit "soft-delete with
    `product.brand_id → SET NULL` for any stragglers... never leave
    products pointing at a deleted brand id." Unlike `category.remove()`
    (which *blocks* on live children), brand's `remove()` is meant to be a
    blunt tool for a "truly unused" brand — `merge()` is the documented
    path when real products still reference it (preserves the brand
    identity via relink + alias). Fixed: `remove()` now `updateMany`s
    every live `product.brand_id` pointing at it to `null` in the same
    transaction as the soft-delete, and the audit `reason` reports the
    relinked count (`"soft delete (N products relinked to no brand)"`).
  - **`restore()` and its controller route didn't exist at all** despite
    plan/25 saying brand restore is supported (same row) — added, mirroring
    `category.restore()`'s collision-checking (blocked if a live row has
    since taken the name/slug) but without the tree/cascade machinery
    category needs (brand is flat). Surfaced a second schema asymmetry
    while testing it: `category.slug`'s global uniqueness is a **partial**
    index (live rows only, migrated in for exactly this reason — see the
    2026-09-04 entry), but `brand.slug` is a **full** unique constraint —
    a soft-deleted brand's slug can never be picked up by anything else,
    ever, even after restore-blocking logic would otherwise allow it. Not
    changed (a broader uniqueness-semantics call, flagged for the user
    rather than decided solo) — the new integration test exercises the
    *name* collision instead (app-level only, filtered to live rows —
    actually reachable), and notes why the slug variant isn't.
  - `Brand`/`CreateBrandRequest`/`UpdateBrandRequest` contracts
    (`packages/contracts/src/catalog.ts`) gained `isRestricted`.
  - New integration tests: `isRestricted` round-trips independently of
    `status`; `remove()`'s relink behavior (verified via
    revert-confirm-restore — reverting to the old no-guard delete left a
    dangling `product.brand_id`, exactly the bug being fixed); `restore()`
    happy path + the not-found/not-archived/name-collision cases. Full API
    suite green (112 integration incl. 3 new, 25 unit); typecheck/lint
    clean.

- 2026-09-17 — Brands admin UI (second/final stage of the same feature).
  List page + create/update form + a dedicated merge dialog, mirroring
  Categories' CRUD-kit pattern minus everything tree-specific (Brand is
  flat). New files: `features/catalog/brands/{api,brand-list,
  brand-form-modal,brand-merge-dialog}.tsx` + route at
  `catalog/brands/page.tsx`. Delete uses the established soft-delete +
  undo-toast idiom (not `ConfirmDialog` — that's reserved for restore,
  matching Category List's own split); merge gets its own dialog rather
  than reusing delete's, per the design decision from this feature's
  planning discussion (merge is brand's real "remove" path and has
  real, non-undoable consequences a one-click undo can't cover).
  - **Filter layout**: Brand has two independent axes — `status`
    (pending/active/rejected) and archived-or-not (`deletedAt`) — where
    Category only had one (archived-or-not, handled by a 3-way
    live/archived/all tab). Went with a Live/Archived tab (Archived is
    where `restore` lives) plus a status dropdown shown only on the Live
    tab, rather than a combined status×archived tab set.
  - **Surfaced a real gap while building this**: `BrandService.list()`
    had no way to ever list archived rows (`deletedAt: null` was
    hardcoded) — meaning `restore()` (added in the last stage) had no
    discoverable entry point beyond the immediate delete's undo-toast
    window. Added an `archived` list option + `?archived=true` query
    param, mirroring Category's equivalent. New integration test; API
    suite now 113.
  - **Known limitation, not fixed**: the Audit Log's brand deep-link
    always targets the *live* list (Brand has no combined `status=all`
    view the way Category does). A `brand_deleted`/`brand_merged` audit
    row's target (now archived) simply won't be found there — degrades
    to "link does nothing" (same as any not-found id), not an error.
    Documented inline in `audit-log.tsx`; revisit if this turns out to
    matter in practice.
  - Extracted the admin app's `slugify`/`slugifyLive` helpers (previously
    private to `category-form-modal.tsx`) to `apps/admin/src/lib/
    slugify.ts` on their 2nd genuine occurrence, per the standing reuse
    rule — Categories' own form now imports the shared version too, no
    behavior change (verified byte-identical regex ranges).
  - Built and reviewed via a fork (91 tool calls, ~389k tokens) with the
    full feature context from this conversation's planning discussion;
    every file it touched was read back and independently re-verified
    (typecheck/lint/test, not just the fork's own claim) before staging.
    Admin suite: 25 files / 209 tests (was 204, +5 new, 0 broken). Full
    API suite: 113 (was 112, +1). Not yet live-verified in a browser —
    the route resolves (307 → login redirect when signed out, not a
    404) but nothing beyond that has been clicked through; next step is
    the user's own UI walkthrough, same as every other feature this
    project.

- 2026-09-17 — Six issues reported from that first live UI walkthrough of
  the Brands page, all discussed and root-caused before touching code:
  1. **Row actions touching the table's right border** — the icon-only
     column (`md`–`lg` viewports, before labels reappear) was sized
     `w-28` (112px), too narrow for 3 icon buttons + gaps + cell padding
     (needs ~150px+). Widened to `w-36 lg:w-72` + `whitespace-nowrap` on
     the cell.
  2. **Couldn't restore a deleted brand.** Root cause: the status
     dropdown only *renders* on the Live tab, but its last-picked value
     stayed in component state and kept being sent on the Archived
     query underneath — so any status filter touched before switching
     tabs silently hid the row you were trying to restore. Fixed by
     gating `status` on `tab === 'live'` in the fetch, not just the
     dropdown's visibility.
  3. **Full list blanks then reloads after every action.** Root cause,
     not Brand-specific: `useScrollLoad`'s `retry()` synchronously clears
     `items` and sets `loading: true` before refetching — fine for a
     "Try again after total failure" button, wrong for a post-mutation
     resync. Category mostly never hits this because its *primary* view
     is an unpaginated tree with its own separate `load({background:
     true})` loader; Brand has no tree, so it's always on the flat path.
     Added a real `refresh()` to the shared hook (refetch page 1, swap
     `items` in on success, never clear/error synchronously) — fixes
     this for Brand now and for every future flat-only entity (option
     types, value sets, …) for free.
  4. **Alias count in the list stale until a full reload.** The form
     modal's add/remove-alias calls only updated its own local state,
     never told the list. Added `onAliasesChanged` — the list now
     patches that one row via `setItems`, no extra fetch.
  5. **Duplicate-alias error showed as a toast**, inconsistent with the
     same form's name/slug fields (inline, under the field) — the alias
     input lives outside react-hook-form (its own endpoints, not part of
     the PATCH body) so its error path never got the same treatment.
     Given its own local error state + inline message, matching the
     established pattern instead of the toast shortcut.
  6. **`q` didn't split on whitespace** — `list()` did one `contains` on
     the whole query string, so "pla lev" only matched a literal
     "pla lev" substring, not a row containing "pla" and a different row
     containing "lev". Category already solved exactly this
     (`tokenizeForSql`, OR-semantics per-word matching) — **initially
     proposed extracting it to a shared module** (a would-be 4th
     same-package copy), but `identity/staff-accounts.service.ts`'s and
     `identity/audit.controller.ts`'s own copies each carry a doc
     comment explicitly recording that decision as already made twice:
     "duplicated rather than shared, following [that file]'s own
     precedent of not extracting this into a cross-package util."
     Course-corrected mid-implementation to follow that explicit,
     repeated precedent instead of the initial proposal — brand.service.ts
     got its own 4th copy, not a shared one.
  - Surfaced a second real bug while fixing #6: the existing `'soft-deletes
    and drops from list'` test queried `s('gone')` (the file's full
    `itest-brand-<stamp>-gone` stamp prefix) expecting a narrow match —
    under OR-semantics tokenization that string's shared "itest"/"brand"/
    stamp tokens now (correctly) match every fixture in the file, not just
    this one. Same documented tradeoff `category.service.ts`'s own search
    test already calls out ("`stamp` alone would... match the whole file's
    fixtures via their shared slug prefix"). Fixed the test to use an
    unscoped single-word marker, not the code.
  - New/extended tests for all six: 3 in `brand-list.test.tsx` (statusFilter
    gating, alias live-update with an exact call-count assertion, inline
    vs. toast error), 1 in `brand.service.integration.test.ts` (token OR
    matching). Revert-confirm-restore on the two with the clearest
    regression signal (search tokenization, statusFilter leak) — both
    failed for the exact right reason, restored. Full sweep green: admin
    212 tests (was 209), API 114 integration (was 113) + 25 unit;
    typecheck/lint clean on both packages.

- 2026-09-18 — Seven more from the *next* live walkthrough, each discussed
  with options before any code (D1 — "discuss before a big batch"):
  1. **Row actions collapse into a "…" menu, always** — new project-wide
     rule, not a per-page judgment call: any row with 2+ actions uses
     `DropdownMenu` (mirroring `staff-list.tsx`'s `renderMenu`), never
     direct icon buttons, regardless of how many actions there end up
     being. Brand's desktop table AND mobile card list both moved to it
     (mobile had never had Merge/Delete reachable at all before this —
     only Edit/Restore — a real gap this closes for free). Supersedes the
     2026-09-17 entry's action-column width patch entirely: a fixed-width
     menu trigger can't crowd a border no matter how many actions a row
     grows.
  2. Reported "delete has no undo" turned out not to be a bug — `doDelete`
     already calls `notify.undo` correctly. No code change; confirmed with
     the user before touching anything.
  3. **Modal cut off at the top with no way to scroll to it — a shared
     `packages/ui` bug, not Brand's.** `ModalContent` positioned via
     `top-[42%]` + `-translate-y-1/2` with a `max-h` cap; for content
     whose height approaches that cap (Brand's edit form with several
     aliases got there first, but nothing about the bug is Brand-specific)
     the math puts the panel's top edge above the viewport, and since it's
     `fixed`, no page scroll can reach it back — only `ModalBody`'s
     internal scroll, which doesn't reposition the header. Rebuilt as two
     nested layers: an outer plain (non-flex) `overflow-y-auto` block, an
     inner ordinary `flex items-center justify-center` with `min-h-full`.
     Deliberately not one `flex` container with `overflow-y-auto` — that
     combination has a known cross-browser quirk where `align-items:
     center` can clip a scrolled-to child's top instead of reaching it,
     which is the same *class* of bug this is fixing, just from a
     different cause. `Drawer` uses `inset-y-0` (always exactly viewport
     height) and was never affected — confirmed, not just assumed, by
     reading it. Every modal in the app inherits this fix for free
     (`ConfirmDialog`, Category's edit form, Staff invite, …); the full
     213-test admin suite (unchanged in count, all still green) was the
     practical regression check, since `packages/ui` itself has no test
     infrastructure to add a dedicated one into — an existing-precedent
     call, not an oversight.
  4. **Create-mode alias errors surfaced only at Save, not at Add** — Edit
     mode's `addAlias` hits a real endpoint immediately, catching a
     duplicate right away; Create mode had no brand id yet for that
     round-trip, so a duplicate went unvalidated until the whole form
     submitted. New `BrandService.aliasAvailable()` (reuses
     `assertAliasesFree`'s own exact/case-insensitive lookup, returns a
     boolean instead of throwing) + `GET /admin/v1/brands/aliases/
     availability?alias=…` + `brandAliasAvailable()` client call — Create
     mode's "Add" now checks this before ever staging the alias, blocking
     it at the same point Edit mode effectively does.
  5. **Two badges (Status + Restricted) in one column read as competing
     states** — they're not the same kind of thing (`status` is a
     lifecycle enum; `isRestricted` is an orthogonal flag, same reasoning
     as the 2026-09-17 entry that added the column). Moved `isRestricted`
     to a small `ShieldAlert` icon+tooltip next to the brand name — common
     real-world pattern (a flag sits by the title, not stacked into a
     status column) — leaving Status as the column's one badge. Dropped
     the now-unused `brands.restricted` message key (kept
     `restrictedHint`, still used for the tooltip/aria-label).
  6. **An undo toast for a deleted row stayed open after the same row was
     restored a different way** (the Archived tab's own Restore, not the
     toast's own Undo button) — confirmed shared, not Brand-only: Category
     has the identical `notify.undo`-on-delete pattern. New
     `notify.dismissUndo()` on the shared toast module (dismisses
     whichever undo toast is currently showing, by the module's one fixed
     toast id — the *caller* is responsible for only invoking it when it
     knows that toast really was for the same row, never a blanket
     "any restore clears it"). Each list tracks which row (if any) its own
     last-shown undo toast was for via a plain ref, and only calls
     `dismissUndo()` when an independent restore matches that same id —
     restoring a *different* row leaves an unrelated pending undo toast
     alone, per the user's own explicit scoping. Applied to both
     `brand-list.tsx` and `category-list.tsx`; the latter has a *second*
     `notify.undo` call (drag-reorder's own undo, sharing the same fixed
     toast id) that resets the tracking ref to `null` wherever it fires,
     since it always overwrites whatever undo toast — delete's or its
     own — was showing.
  7. **Alias add/remove firing immediately instead of batching until
     Save** — discussed, kept as-is. Real-world tag/label editors (GitHub
     topics, Linear labels, Gmail labels) generally commit each add/remove
     immediately since each is independently a complete, reversible
     action; Edit mode already matches that. The asymmetry wasn't "Edit
     mode is wrong," it was "Create mode can't do the same thing (no id to
     save against) and silently downgrades to stage-and-hope" — that gap
     is #4 above, not a reason to make Edit mode weaker to match.
  - New/extended tests: 2 in `brand-list.test.tsx` (create-mode alias
    blocking with an exact draft-aliases-body assertion; undo-toast
    dismissal on a matching archived-tab restore, using `waitFor` since
    `sonner` removes a dismissed toast's DOM node after its own exit
    animation, not synchronously) + 1 restyled existing assertion (the
    restricted-badge check now asserts the icon's `aria-label` instead of
    badge text). 1 new integration test (`aliasAvailable`'s exact-match +
    case-insensitivity + freed-after-remove behavior). Revert-confirm-
    restore on the two with dedicated regression tests (create-mode alias
    blocking, undo-toast dismissal) — both failed for the exact right
    reason, restored. Full sweep green: admin 214 tests (was 212), API 115
    integration (was 114) + 25 unit; typecheck/lint clean on
    `@shopnetic/ui`, `@shopnetic/api`, and `@shopnetic/admin`.

- 2026-09-18 — Two small follow-ups from the same walkthrough, both quick
  confirm-then-fix (not big-batch discussions):
  - **Restricted icon moved from before the name to after it** (still
    before `/slug`) — a leading icon staggered every restricted row's name
    start out of line with plain rows'. Placed as a `shrink-0` flex
    sibling *after* the name+slug `<p>` (which itself gets `min-w-0
    flex-1 truncate`) instead of both sharing one un-structured truncating
    line — ordinary flexbox then does the "name yields room to the badge"
    behavior on its own: a restricted row's name/slug truncates further to
    keep the icon fully visible, so the row's total width is identical
    whether or not the icon is present, with no bespoke truncation logic
    needed. Applied to both the desktop table and mobile card list.
  - **An Undo toast could end up visually buried behind a later,
    unrelated success toast** — `sonner`'s default stacking collapses
    older toasts behind the newest one. Since an Undo toast's only job is
    staying reachable for its whole window, that default was actively
    wrong here. Fixed with `expand` on the shared `<Toaster>` (a real
    sonner prop for exactly this — not a "can't be helped" limitation),
    keeping every toast in the stack fully shown at once.
  - No new tests (layout/library-config changes, not new logic branches —
    covered by the existing restricted-badge assertion, which still
    passes at the new DOM position, and the full existing suite). Full
    admin suite green: 214 tests, unchanged count; typecheck/lint clean on
    `@shopnetic/admin` and `@shopnetic/ui`.
  - **Immediate follow-up, same session**: the icon reposition above
    still put it after `/slug` — one flex sibling after one truncating
    `name + /slug` text block, not literally between the two. Caught by
    the user, who also flagged a real distinction worth recording: today
    (before any of this), a long name *already* crowds `/slug` out —
    that's existing behavior, not something to newly "fix." The only
    actual guarantee being added is the badge's; `/slug` keeps the exact
    same "can shrink away under pressure" property it always had. Split
    name and `/slug` into two independent flex children (each its own
    `min-w-0 truncate`) with the badge as a `shrink-0` sibling between
    them — name gets `flex-1` (first claim on space, so it's what yields
    for the badge), `/slug` gets plain `shrink` (still just as droppable
    as before, only now independently rather than as literally the tail
    of one text run). Net user-visible behavior for `/slug` is unchanged;
    the only new guarantee is the badge's, which was the actual ask.
    Verified against the full admin suite again (214, still green) —
    no dedicated new test (same reasoning as above: layout-only).
  - **Second immediate follow-up, same session**: `flex-1` on the name
    span was wrong in a different way than either earlier attempt —
    `flex-1` is `flex: 1 1 0%`, which *grows* into unused space, not just
    shrinks under pressure. A short name still expanded to fill the whole
    row, shoving the badge and `/slug` off to the far right edge of the
    column — visually worse than not having a badge at all. What's
    actually wanted is shrink-only: take up only as much room as the name
    needs, but still yield (truncate) if the row is genuinely tight.
    That's `flex-initial` (`flex: 0 1 auto`), not `flex-1` — swapped, on
    both the desktop table and mobile card list. Full admin suite green
    again (214, unchanged) — still no dedicated test; three rounds on a
    layout-only column in one session is itself a signal this class of
    "does the row look right at every width" change is better caught by
    a screenshot/live check than by a jsdom assertion, so none was added.

- 2026-09-18 — Brand had no optimistic-concurrency guard on `update()` at
  all — Category's own `expectedUpdatedAt` → `409 CONFLICT` → close
  modal + refetch + notify pattern was never ported over when Brand's
  form was built, so two staff editing the same brand at once would
  silently last-write-wins with no warning. Asked directly (uniform
  behavior for the same shape of risk across similar entities, unless
  something concretely distinguishes them) rather than assumed — nothing
  about Brand makes concurrent multi-staff edits less likely or less
  costly than Category, so no distinction applies. Ported the identical
  pattern: `UpdateBrandRequest` gained the same `expectedUpdatedAt`
  field (contracts), `BrandService.update()` the same staleness check
  (service), `brand-form-modal.tsx` sends it and handles `CONFLICT` via
  a new `onConflict` prop exactly like Category's own, `brand-list.tsx`
  wires it the same way (close modal, `notify.error`, resync), and
  `brands.editConflict` mirrors `categories.editConflict`'s wording.
  New integration test mirroring `CategoryService`'s own stale-token
  test line-for-line; new component test for the UI flow (modal closes,
  refetches, notifies) — Category itself has no UI-level test for this
  path, so this is coverage Brand now has that Category doesn't, not
  parity-for-parity's-sake. Revert-confirm-restore on both the backend
  check and the frontend wiring — both failed for the exact right
  reason, restored. Full sweep green: admin 215 tests (was 214), API 116
  integration (was 115) + 25 unit; typecheck/lint clean on
  `@shopnetic/contracts`, `@shopnetic/api`, and `@shopnetic/admin`.

- 2026-09-18 — Asked whether Brand's `NOT_FOUND` toast ("Something went
  wrong. Please try again.") on a second-tab delete was expected — it
  isn't, and it's the same systemic gap in both Category and Brand, so
  this became a **project-wide rule**, deep-discussed before any code
  (D1). Every by-id action falls into one of two classes:
  - **Idempotent-outcome actions** (delete, restore, remove-alias): if
    tab B's action fails because tab A already got there, the outcome
    tab B *wanted* is already true. Nothing lost, nothing conflicts — a
    scary error toast actively misleads. These get a calm `notify.info`,
    **per-action wording** (not one generic string), and the list
    already resyncs regardless of success/failure.
  - **Choice-carrying actions** (merge, update — update already fixed
    2026-09-17/18): the outcome genuinely diverges from what the user
    asked for (merged into a *different* target than intended, edited
    over someone else's change) — these block and state plainly what
    happened, same tier as Update's `CONFLICT` handling.
  - **Everything else is deliberately unguarded**: a *different* tab's
    later write winning over an earlier one for `move`/`reorder`
    (Category) and `changeRole` (Staff) is left as last-write-wins, no
    conflict dialog — matching how Trello/Notion/Linear/Google Drive all
    treat a drag-and-drop or settings race: cheap, reversible, nothing
    destroyed, interrupting the user would be worse UX than just letting
    the later action win. `deprovision`/`resetTotp` (Staff) already
    no-op harmlessly if repeated — no guard needed there either.
  - Inventoried and fixed across all three admin lists:
    - **Category**: `doDelete`/`confirmRestore` catch `NOT_FOUND` →
      `alreadyDeleted`/`alreadyRestored` (new keys). `reorderErrorToast`
      (previously only caught `VALIDATION_ERROR` for "a sibling
      vanished, the parent got archived") now also catches `NOT_FOUND`
      (the dragged row or target parent itself vanished) — same existing
      `reloadedAfterChange` info toast, no new mechanism needed.
    - **Brand**: same `doDelete`/`confirmRestore` pattern. `removeAlias`
      (in `brand-form-modal.tsx`) catches `NOT_FOUND` → drops the stale
      chip locally too (it's already gone server-side) + `notify.info`,
      instead of leaving a chip for something that no longer exists.
    - **Staff**: different shape entirely — staff accounts are never
      deleted, only status-flipped, so there's no vanished-target case
      for `deprovision`/`resetTotp`/`changeRole`. `activate()`
      (Unlock/Reactivate) *does* have the idempotent-outcome problem,
      just via `VALIDATION_ERROR` instead of `NOT_FOUND` (the service
      throws it when the account's already active) — `runConfirm`'s
      catch special-cases `kind === 'activate'` + `VALIDATION_ERROR` →
      `manage.alreadyActive`, and patches the row to `status: 'active'`
      locally (we know for certain that's the real state — it's *why*
      the action was rejected) rather than needing a fresh refetch.
    - **Brand.merge stays open** — pending a real decision (surfacing
      the actual merge target's name means extending the shared error
      envelope, `AppError`/`AllExceptionsFilter`/`ApiError`, with a
      generic small metadata channel; `detail` is explicitly dev-facing
      only per F2, and the only existing structured field, `fields`, is
      typed for form-validation issues, not general metadata). Not
      implemented yet.
  - **Found and fixed a real test-infrastructure gap while writing the
    reorder test**: `notify.*`/`toast.*` push into `sonner`'s own
    module-level store, which outlives any one test's React tree —
    `renderAdmin` mounts a fresh `<Toaster/>` per test, but a toast
    triggered in test N is still queued in that shared store and renders
    again the moment test N+1 mounts its own `<Toaster/>`, unrelated to
    that test's own assertions. Caught via a real, reproducible failure
    (two toast-triggering tests back to back in the same file; the
    second one's `not.toBeInTheDocument()` check on a generic error
    caught the *first* test's still-lingering toast). Fixed with a
    global `afterEach(() => toast.dismiss())` in `vitest.setup.ts`, not
    a per-file one — any test file that renders `<Toaster/>` more than
    once could hit this the same way.
  - **Also debugged, unrelated to the actual fix**: the new reorder test
    initially failed with zero API calls ever firing — traced to drag
    being gated behind `matchMedia('(pointer: fine)')`, which is stubbed
    `false` globally and only overridden to `true` in the existing
    `'CategoryList drag-reorder rollback'` describe block's own
    `beforeEach`. Moved the new test into that block rather than its
    original one; a `data-cat-row` id-lookup returning exactly one
    element gave a false sense that placement couldn't be the issue —
    it's only set on the desktop tree's rows, not duplicated on mobile,
    so that particular ambiguity was correctly ruled out, just not the
    actual cause.
  - **Found and left alone, out of scope**: `'flashes the target row
    once the flat/all view has it...'` fails consistently in isolation
    and intermittently in the full suite — confirmed via `git stash`
    that it already failed on the clean pre-session baseline, so it's
    pre-existing, timing/order-dependent flakiness unrelated to any of
    today's changes, not something introduced or silently patched over.
  - New/extended tests: 3 in `category-list.test.tsx`
    (`alreadyDeleted`/`alreadyRestored`/reorder-`NOT_FOUND`), 3 in
    `brand-list.test.tsx` (same three, plus the alias case), 1 in
    `staff-list.test.tsx` (`alreadyActive`) + 1 existing Staff test
    (`'a failed action shows the mapped error copy'`) updated, since its
    `activate`+`VALIDATION_ERROR` fixture is now specifically
    intercepted by this fix and no longer exercises the generic-mapping
    path it was actually testing — switched to `deprovision`+`FORBIDDEN`.
    Revert-confirm-restore on one representative fix per distinct
    mechanism (Category's delete-`NOT_FOUND`, the reorder-`NOT_FOUND`
    path, Staff's activate-`VALIDATION_ERROR`) — Brand's own copies
    weren't independently re-verified, since they're structurally
    identical to Category's already-proven pattern. All three failed for
    the exact right reason, restored. Full admin suite: 221 passing (was
    214 + this round's 8 new = 222 expected; the 1 pre-existing flake
    above accounts for the difference) — no backend changes this round,
    API suite untouched.

- 2026-09-18 — Asked directly whether the "already deleted/restored"
  toast should also update the *other* tab's own stale list, not just
  show the calm message. It should, and mostly already did — `doDelete`
  in both Category and Brand calls `resync()` from a `finally`, so it
  refreshes regardless of outcome. Verified this live rather than
  assuming: extended each "already X" test with a follow-up
  `waitFor(() => expect(screen.queryByText(name)).not.toBeInTheDocument())`
  and ran them. Category's and Brand's delete cases already passed with
  no code change. **`confirmRestore()` (both Category and Brand) did
  not** — it only called `resync()` from the `try` block's *success*
  path, never from `catch` or `finally`, so any restore failure
  (including the new calm "already restored" case, but really any
  failure at all — a real, pre-existing gap this fix happened to
  surface, not something introduced by it) left the stale archived row
  sitting in the list with nothing to refresh it. Fixed by moving
  `resync()` into `finally` in both files, matching `doDelete`'s
  already-correct pattern — one `resync()` call covers both branches
  instead of duplicating it per-branch.
  - Category's own `resync()` fires *two* API calls (the tree's
    `load({background:true})` plus, when on the Archived/flat tab, its
    own `flatRetry()`) — the restore test's mock queue only accounted
    for one, so fixing the code first surfaced a second, unrelated
    failure (`TypeError: (items ?? []).map is not a function`) purely
    from an under-mocked test, not a real bug. Added the missing second
    mock rather than chasing a nonexistent code issue.
  - Reorder/move, Brand's `removeAlias`, and Staff's `activate` were
    already confirmed correct in the same pass: `applyMove`'s `finally`
    already resyncs both branches; `removeAlias` and `activate` patch
    local state directly (no resync needed) and both already had
    assertions proving the row updates in place.
  - Revert-confirm-restore on both `confirmRestore` fixes (Category,
    Brand) — both failed for the exact right reason when the `finally`
    move was undone, restored. Full admin suite green: 221/222
    (unchanged — the one pre-existing flake from the prior entry, still
    untouched).

- 2026-09-18 — Follow-up from the same "does the list actually update"
  check: reported that Category's Live tab delete removes the row
  silently, but Archived/All-tab restore/delete visibly reloads the
  *whole* list. Live's tree already used a background, no-blank
  reload (`load({background:true})`, built earlier for exactly this);
  the flat/paginated side (Archived, All, search) used `flatList.retry`
  in `resync()` — the blank-then-reload version, meant for a real "Try
  again after total failure" button, not a quiet post-mutation refresh.
  This is the identical bug Brand's own list had and was fixed for on
  2026-09-17 (`useScrollLoad` gained a real `refresh()` for exactly
  this) — Category's flat view was simply never switched over, since
  its primary, most-tested surface (the tree) was already correct via
  a wholly separate mechanism, so the flat side's flash went unnoticed
  until an Archived-tab action was actually exercised. One-line fix:
  `flatList.retry` → `flatList.refresh` in `resync()`'s flat branch.
  The dedicated "Try again" button elsewhere in the file correctly
  keeps `flatList.retry` — that one's a response to a genuine total
  failure and should blank + reload.
  - New regression test needed real care to actually catch the bug: an
    immediate synchronous check after firing the restore click passed
    even with the old `.retry` in place, since the async handler hadn't
    reached `resync()` yet at that point — a false pass, caught before
    trusting it. Redesigned using a manually-held-open promise for the
    flat refresh's own response, so the assertion runs in the exact
    window where `.retry` has already synchronously cleared `items` but
    `.refresh` hasn't (a second, unrelated row must still be visible
    there). Revert-confirm-restore against *this* redesigned test then
    correctly failed with `.retry` restored, confirming the test itself
    (not just the fix) is sound. Full admin suite green: 222/223 (the
    one pre-existing flake, still unrelated and untouched).

- 2026-09-18 — Asked for on/off toggle switches (Brand's Restricted,
  Category's Active) in place of plain checkboxes, discussed first:
  confirmed clicking the *label* text still toggles it (both fields
  already wrap the checkbox in a real `<label>`, and a `<label>` forwards
  a click to any "labelable" descendant per the HTML spec — `<button>`
  included, which is what Radix's `Switch` renders under the hood, so the
  existing wrapping needs zero new wiring for that part) — and that
  color + thumb position + `aria-checked` is enough for state clarity
  without extra "On/Off" text, same convention as "Airplane Mode" in iOS
  Settings or "Public repository" on GitHub: the label names *what the
  flag is*, the switch shows *its value*.
  - New `Switch` in `@shopnetic/ui` (`@radix-ui/react-switch`, new
    dependency, version-pinned to match every other Radix dep in that
    package — no caret) — thin wrapper matching D1, same shape as the
    existing `Checkbox`. Swapped into both `category-form-modal.tsx`
    (`isActive`) and `brand-form-modal.tsx` (`isRestricted`), each via
    `react-hook-form`'s `Controller` (first use of `Controller` in this
    codebase — a Radix `Switch` isn't a native input, so the usual
    `register()` spread doesn't apply the way it does for a real
    checkbox).
  - Separately noted, not acted on: `@shopnetic/ui` already had an
    unused `Checkbox` (also Radix-based) that neither of these two forms
    had adopted — same "D1 names it, nobody built/adopted it" gap as the
    `Link` wrapper found on 2026-09-17.
  - **Found and fixed a second real jsdom gap while writing the tests**:
    Radix `Switch` measures its thumb via `ResizeObserver`
    (`@radix-ui/react-use-size`), which jsdom doesn't implement — every
    test that rendered a `Switch` at all threw `ResizeObserver is not
    defined`, including several pre-existing Brand tests that only
    happened to render the form incidentally. Same category of gap as
    the existing `matchMedia`/`scrollIntoView`/pointer-capture stubs
    already in `vitest.setup.ts` — added a no-op `ResizeObserver` stub
    there alongside them.
  - New tests (one per entity) proving the label-click path specifically
    — not just that the switch renders — clicking the label text (found
    via `getAllByText`/`.closest('label')` to sidestep ambiguity from a
    nested hint span on Brand's field, and dialog-scoped `within(...)`
    on Category's since "Active" is also a status-badge word elsewhere
    on the same page) flips `aria-checked` and the toggled value reaches
    the PATCH/POST body. Revert-confirm-restore on Brand's wiring
    (breaking `onCheckedChange` correctly failed the test) — Category's
    wasn't independently re-verified, same reasoning as prior entries:
    structurally identical, already-proven pattern. Full admin suite
    green: 224/225 (the one pre-existing flake, still untouched);
    typecheck/lint clean on `@shopnetic/ui` and `@shopnetic/admin`.

- 2026-09-18 — Two bugs from a self-audit requested after the Switch work
  (corner cases, test coverage, DRY, "anything else" — the fixes below are
  the first, agreed-priority slice of that list, not the whole thing):
  - `BrandService.removeAlias()` never wrote a `catalog.outbox` row — every
    other brand mutation (`create`/`update`/`addAlias`/`merge`/`remove`/
    `restore`) does, so search and any other outbox consumer silently
    never learned an alias had been removed. Fixed by wrapping the delete
    in a `$transaction` + `writeCatalogOutbox('brand.updated', {
    aliasRemoved })`, matching `addAlias`'s own shape. New integration
    assertion on the existing alias-removal test (`catalogOutbox`
    row exists, payload has the removed alias); revert-confirm-restore
    (reverting the service change correctly failed it) — full
    `test:integration` suite green (116/116).
  - Category's New/Edit modal's parent picker went permanently empty when
    opened from the Archived or All tab: it was built from
    `(items ?? []).filter(c => c.archivedAt == null)`, but `items` is
    whatever the *current tab's* `status` loaded — on Archived that's an
    all-archived list, so the filter always yielded nothing. Fixed by
    reusing `items` for free on the Active tab (unchanged, still the
    correct list there) and fetching `listCategories({status:'active'})`
    separately, only while the modal is open, on the other tabs. New test:
    switch to Archived, open New Category, assert the live "Alpha" row
    appears as a parent `<option>`. Revert-confirm-restore (reverting the
    component change correctly failed it) — full admin suite green: one
    file has a single pre-existing, unrelated flake (a row-flash CSS-class
    assertion, reproduced identically on a clean `git stash`, untouched).
  - Follow-up, caught live from an Audit Log screenshot: `addAlias`/
    `removeAlias` both recorded the generic `catalog.brand_updated` action
    (same as a plain name/slug/status/logo edit), so the Action column
    alone couldn't tell an admin an alias had changed — only expanding the
    row and reading Before/After could. Gave each its own action —
    `catalog.brand_alias_added` / `catalog.brand_alias_removed` — mirroring
    the existing `category_moved` vs `category_updated` split (a
    semantically distinct operation gets its own action name, not a bucket
    under the generic one). Audit actions are ad hoc strings per
    `this.record(...)` call, not a central enum, so this is a two-call
    change with no other registry to update. Extended the alias
    integration test to call `addAlias` for real (previously the brand was
    created with the alias already attached) and assert both actions;
    revert-confirm-restore (reverting the service change correctly failed
    it) — full `test:integration` green (116/116).
