# Product Group Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store several complete colour variants in one product group, show each variant separately in the catalogue, and switch variants inside one buyer product screen.

**Architecture:** `products` becomes the stable group record while `product_options` owns the sellable fields, images and size stock of one colour. The Edge Functions return groups with nested options; the browser flattens them only for the catalogue and keeps a selected option in the product screen.

**Tech Stack:** Vanilla JavaScript, Node `node:test`, Supabase Postgres, Supabase Edge Functions, GitHub Pages.

**Spec:** `tg-app/docs/superpowers/specs/2026-09-02-product-group-variants-design.md`

## Global Constraints

- Do not add a framework, build tool or npm dependency.
- All seller copy is Russian; label the manual input only `Цвет`.
- Preserve existing products by creating exactly one option per existing product during migration.
- A draft accepts incomplete data; publishing validates every option server-side and client-side.
- Keep admin controls at least 44 × 44 px and prevent horizontal overflow from 320 to 430 px.
- Do not expose Supabase secrets or weaken the existing raw Telegram `initData` verification.

---

### Task 1: Define group and option behaviour in pure client logic

**Files:** `tg-app/core.js`, `tg-app/tests/core.test.js`.

- [ ] Write a failing test that flattens two colour options from one group into two catalogue cards.
- [ ] Run `node --test tg-app/tests/core.test.js` and confirm red.
- [ ] Add `Core.flattenCatalogProductGroups`, `Core.getSelectedProductOption` and per-option group validation.
- [ ] Run the focused suite and commit.

### Task 2: Add the safe Supabase group-option migration

**Files:** generated migration, `supabase/functions/_shared/admin-product.ts`, `supabase/functions/tests/admin-product.test.js`.

- [ ] Write a failing server test for a second option without a photo.
- [ ] Run `node --experimental-strip-types --test supabase/functions/tests/admin-product.test.js` and confirm red.
- [ ] Generate migration through Supabase CLI; add option tables, RLS, read policies and one-time conversion of existing data.
- [ ] Apply and inspect migration; verify one option per existing product and no anonymous write policy.
- [ ] Run the server test and commit.

### Task 3: Make both Edge Functions read and write nested options

**Files:** `supabase/functions/admin-api/index.ts`, `supabase/functions/catalog-api/index.ts`, server tests.

- [ ] Test first that a second option keeps its own price, images and size stock.
- [ ] Implement atomic option persistence, signed option images and per-option publication validation.
- [ ] Verify unauthenticated seller access is still rejected and deploy functions.
- [ ] Commit.

### Task 4: Serialize groups and render the buyer flow

**Files:** `tg-app/api.js`, `tg-app/app.js`, API and smoke tests.

- [ ] Test first for two catalogue cards from one group and a colour switch without navigation.
- [ ] Implement deserialization, catalogue flattening, active option state and buyer colour controls.
- [ ] Run tests and commit.

### Task 5: Replace the seller colour editor with complete option cards

**Files:** `tg-app/app.js`, `tg-app/styles.css`, smoke tests.

- [ ] Test first for the button `Добавить вариант товара`, full option forms, `Цвет` and no `синонимы`.
- [ ] Replace the editor and form synchronization; focus and scroll to a newly inserted option.
- [ ] Add single-column mobile CSS without transforms or negative margins.
- [ ] Run tests and commit.

### Task 6: Document, verify and publish

**Files:** `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`.

- [ ] Update documentation and run syntax checks, browser test suite, server tests and `git diff --check`.
- [ ] Attempt 320, 375 and 430 px inspection, recording unavailable device checks honestly.
- [ ] Commit, push `main`, verify remote SHA and published GitHub Pages assets.
