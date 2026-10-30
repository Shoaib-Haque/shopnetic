# Enterprise Engineering Directive: Full Sweep & Batch-Wise Architectural Verification

## 1. Context & Objective
You are acting as a Principal Software Architect and Lead Full-Scale Systems Engineer. Your task is to perform an exhaustive gap analysis, verification, and audit of the codebase, database schemas, and planning documents for the target e-commerce feature module.

Do NOT write or modify code automatically yet. Your immediate objective is a deep-dive architecture audit against the strict production standards below.

## 2. Batch Scope & Exclusions
* **Active Batch Filter:** Explicitly identify which features, modules, caching layers, or workflows are part of the *current implementation batch* versus those intentionally **out-of-scope/deferred** for future batches. Do not flag deferred items as missing bugs.

## 3. Core Architectural Principles (SSoT, Caching & Resilience)
* **Backend & Database as SSoT:** Verify that the backend services and database layer act as the definitive Single Source of Truth (SSoT) for all business logic, pricing calculations, state changes, and permissions. The frontend must be treated merely as a projection and cache layer.
* **Caching & State Invalidation:** Audit caching layers (Redis, CDN, memory). Ensure explicit write-through purging or pub/sub invalidation triggers immediately upon any database mutation (prices, inventory, product edits) to prevent stale reads.
* **No Full-List Reloads on Mutation:** **Strict UI/UX State Rule:** Adding, editing, deleting, or changing the state of any entity (e.g., toggling product status, updating a variant attribute, editing a seller offer) must **NEVER trigger a full reload/re-fetch of the entire entity list**. The architecture and frontend state management must use localized patching, optimistic updates, or targeted cache mutations (e.g., updating only the specific row/card in memory) to ensure high performance and zero UI layout shifts.
* **Database Optimization, Indexing & Migrations:** Inspect database schemas for proper indexing (foreign keys, search fields, sorting columns, composite indexes). Verify that database migrations are **backward-compatible** to support zero-downtime rolling deployments across batches.
* **Idempotency & Webhook Safety:** Ensure critical financial, inventory, and order-placement endpoints handle idempotency keys and duplicate webhook triggers safely without race conditions or double-processing.
* **Audit Trails & Error Logging:** Ensure every critical write, destructive action, state transition, or sensitive update generates an immutable audit log. Verify structured error log handling across the entire stack.

## 4. Scope & Feature Validation Checklist
Analyze the implementation plan and codebase against every item below, identifying any gaps, missing logic, or edge cases:

* **Validation & Integrity:**
   * Strict input validation and sanitization on *all* forms, modals, and API endpoints (preventing race conditions, malformed payloads, and injection).
* **Undo / Reversion Workflows:**
   * Comprehensive undo/rollback mechanisms for destructive or state-altering actions (e.g., editing, deleting, bulk status updates, or draft overrides).
* **Advanced Search & Ranking Algorithm:**
   * Search implementation must support flexible matching (any word matches, but queries with *most* word matches or higher exact-match relevance bubble to the top). Verify integration with search indexing engines.
* **UI Selections, Dropdowns & Lists:**
   * Exhaustive handling of all edge cases across nested lists, sub-lists, pagination, and dropdown select options (including empty states, stale selections, and dynamic reloading).
* **Future-Proofing & Cross-Feature Integration:**
   * Ensure the module is modular and decoupled, cleanly integrating with adjacent systems (e.g., inventory tracking, tax engines, multi-vendor offers, and notification services) without tight coupling.
* **Corner Cases & Exception Handling:**
   * Identification of potential concurrency bottlenecks, deadlocks during stock decrements, partial failures in multi-vendor split orders, and unhandled promise rejections.

## 5. Planning & Testing Verification
* **Plan Files:** Check if existing plan files (`PLAN.md` or architecture docs) are fully up to date. Determine if anything else needs to be added or modified in any plan file for the current batch.
* **Unit & Integration Tests:** Verify that comprehensive unit tests and backend integration tests exist and cover edge cases.
* **UI & E2E Testing:** Verify if UI/E2E test suites cover user interaction flows. Execute or simulate UI checks to catch live rendering, state-sync, or validation bugs.

## 6. Execution Instructions for the Agent
* **Analyze:** Inspect the codebase, database schemas, migrations, API routes, and planning documents.
* **Filter by Batch:** Clearly categorize findings based on what belongs to the current batch versus deferred batches.
* **Do Not Alter:** Do not change or refactor any code yourself in this step.
* **Report:** Provide a detailed, structured gap analysis report highlighting:
   * SSoT violations or cache synchronization flaws.
   * Missing database indexes, constraints, or unsafe migration patterns.
   * Unhandled edge cases, concurrency risks, or idempotency gaps in the current batch.
   * UI components that incorrectly trigger full-list reloads instead of localized state patching on mutations.
   * Recommended modifications to plan files, test suites, or error logging.

## 7. SEO Meta Architecture & Crawlability:**
* **SSR/ISR Verification:** Verify that product, category, and CMS pages use Server-Side Rendering or Incremental Static Regeneration so search engine bots (Googlebot) receive fully formed HTML.
* **Structured Data (JSON-LD):** Inspect templates for dynamic injection of valid Schema.org markup (Product, Offer, AggregateRating, Breadcrumbs).
* **Canonicalization & URL Hygiene:** Check for correct canonical link implementation to prevent duplicate content indexing across faceted filters and sorting parameters.
* **Sitemaps & Robots Management:** Ensure automated XML sitemap generation and proper handling of index/noindex meta directives.

## 8. Answer Engine Optimization (AEO) & AI Readability:**
* **Extended Schema Markup:** Verify implementation of rich structured data beyond basic products—specifically `FAQPage`, `Review`, and attribute-rich JSON-LD tables that AI agents (Gemini, ChatGPT, Perplexity) parse for direct citations.
* **Conversational Content Structure:** Check that product and category templates support direct Q&A blocks and clean, parsable specification matrices rather than unstructured text walls.
