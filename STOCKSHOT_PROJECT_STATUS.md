# StockShot — Project Status & Tech Snapshot

**Purpose:** Quick-read handoff document for starting a new Claude Code or Claude chat session with full context. Cover what's built, what's deferred, where the technical debt is, and what's actively pending.

**Last verified against code:** June 2026 (commit `d41d4a0`)
**Current version:** 1.2.6

---

## What StockShot is

A web app used by photo studios (built by Enhance Retail) to track physical fashion stock through a shoot lifecycle. Operators scan barcodes to move items between At Studio → In Transit → At Client locations, group items into Looks, mark which have been shot, and export label/list PDFs for offline reference at client.

**Stack**
- React 19 + Vite + TypeScript
- Tailwind 4 (CSS-first `@theme` tokens, no `tailwind.config.js` extension)
- Zustand for state
- Supabase for auth + database + realtime
- Hosted on Vercel (Hobby/free tier)
- Phosphor Icons (`@phosphor-icons/react`)
- Inter font (loaded via rsms.me — flagged as performance improvement)

**Key dependencies (from `package.json`)**
- `@phosphor-icons/react` — icon library
- `@supabase/supabase-js` — backend client
- `@zxing/browser` + `@zxing/library` — barcode/QR scanning
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — drag-and-drop (Look Builder)
- `jspdf` — PDF generation (static import, see "Known issues")
- `papaparse` — CSV parsing for imports
- `qrcode` — QR code generation
- `xlsx` — Excel import/export
- `react`, `react-dom`, `react-router-dom` — core
- `uuid` — UUID generation
- `zustand` — state management

**Repo:** github.com/patrickniland/stockshot-web
**Deploy:** stockshot-web.vercel.app
**Status:** Internal beta. Working directly on `main`, no PR workflow.

---

## Architecture overview

```
src/
├── App.tsx
├── main.tsx
├── index.css                    ← @theme tokens, Inter import, utilities
├── components/
│   ├── ui/                      ← design system primitives
│   │   ├── Button.tsx           (variants: primary/secondary/ghost/danger; sizes: sm/md/lg)
│   │   ├── Card.tsx             (padding variants)
│   │   ├── Input.tsx            (forwardRef, scannerMode prop)
│   │   └── Toast.tsx            (queue-based provider + renderer)
│   ├── Layout.tsx               ← responsive sidebar + clickable sync indicator + app version
│   ├── LookBuilder.tsx          ← modal for grouping items into looks (uses dnd-kit)
│   ├── QRCode.tsx
│   ├── ShootPicker.tsx
│   ├── CameraScanner.tsx        ← uses zxing for camera-based barcode scanning
│   ├── PinEntryModal.tsx        ← admin PIN entry (not yet migrated to design system)
│   ├── OperatorPinEntry.tsx     ← operator-level PIN entry (separate from admin)
│   └── AdminGuard.tsx
├── pages/
│   ├── ScanInView.tsx           ← responsive, scanner mode, In Transit + Dispatch Mode
│   ├── ScanOutView.tsx          ← responsive, scanner mode, at_studio gate
│   ├── ShotListView.tsx         ← responsive (desktop + iPad), shoot name in header
│   ├── StockListView.tsx        ← responsive (desktop + iPad), shoot name in header
│   ├── ImportView.tsx
│   ├── JobsView.tsx             ← Shoots page
│   ├── PendingView.tsx          ← Missing page
│   ├── ReportsView.tsx          ← Dashboard
│   ├── LoginView.tsx
│   └── admin/
│       ├── AdminSettingsView.tsx
│       ├── BulkStatusChangeView.tsx
│       ├── ClientsView.tsx
│       ├── OperatorsView.tsx    ← manage PIN-authenticated operators
│       └── TrashView.tsx
├── hooks/
│   ├── useMediaQuery.ts         ← responsive breakpoint detection
│   ├── useNavSync.ts            ← re-click nav triggers sync
│   ├── useSupabaseSync.ts       ← syncing logic + clickable sync indicator
│   └── useToast.ts
├── lib/
│   ├── auth.ts                  ← operator auth + role gating
│   ├── csvExport.ts
│   ├── db.ts                    ← DB abstraction layer
│   ├── importCoordinator.ts     ← import workflow
│   ├── pdfExporter.ts           ← Labels, Shot List, Stock List PDFs (v3 design)
│   ├── qrGenerator.ts           ← QR code generation
│   └── supabase.ts              ← Supabase client setup
├── store/
│   └── useAppStore.ts           ← Zustand
└── types/
    └── index.ts
```

---

## What's been completed

### Foundation (original 6-phase rebuild — merged)
- Tailwind 4 `@theme` block in `src/index.css` with brand/semantic/surface/typography/radius tokens
- Inter font loaded via CSS import
- Phosphor Icons globally configured
- Base UI components: Button, Card, Input, Toast
- Responsive sidebar (full / icon rail / phone tab bar with redirect)
- Scan In + Scan Out fully responsive with scanner mode
- Scanner mode: `inputMode="none"` suppresses iOS keyboard, auto-refocus, "Use keyboard instead" affordance
- Feedback polish: haptics, success/error flashes, optional sound, toast notifications

### Design system migration across all remaining pages (Phase D — merged)
All 9 pages migrated. Commits in order:
- ShotListView (`49de0f3`), StockListView (`1063fb0`), LookBuilder (`28c1e41`)
- ImportView (`21c0bff`), JobsView/Shoots (`0e6e5d7`), PendingView/Missing (`3b81ec7`)
- ReportsView/Dashboard (`cdbd2a6`), LoginView (`93af305`), Admin pages (`84d52f9`)

### iPad responsive polish
- Touch targets improved across Shot List, Stock List, Look Builder (`afda1e8`)
- Shoot action buttons wrap on iPad (`b4ce053`)
- Active shoot name in headers, description columns widened (`113d15e`)

### PDF exports redesigned (`9ecb4e2`)
Per v3 brief: Stock List + Description, Shot List minus Location + wider Description, Labels with Description below QR with 2-line word-wrap. Page header strip + slugified filenames on all three. Design system colors throughout. jsPDF later reverted to static import (`9a44542`) to fix stale-chunk errors.

### Sync UX improvements
- Clickable "Synced X ago" indicator triggers manual sync (`f4cde45`)
- Re-clicking active nav item triggers sync (`27938cf`)
- App version shown in sidebar (`aa23845`)

### Scan workflow expansion
- Dispatch Mode added: `at_client → in_transit` (`deef7d4`)
- In Transit added as third location option (`6b4df90`)

### Operator authentication system (significant — recent)
- PIN-authenticated operator system (`53bcdb5`) with separate `OperatorPinEntry.tsx` component
- Studio/Client role assignment (`790d9f2`)
- `at_studio` gate on ScanOutView (`d41d4a0`) — only Studio-role operators can scan out
- Admin → `OperatorsView` for managing operators
- Implies tables in Supabase for operators + their PIN + role

### Look Notes feature (July 2026 — `6920a71`)
- Per-look plain-text notes written on Scan In (desktop/iPad only, not phone)
- Displayed inline in Shot List view header and in Shot List PDF export
- New `look_notes` Supabase table with `UNIQUE (shoot_id, look_number)` constraint and org-scoped RLS policy
- Postgres RPC `swap_look_notes` handles atomic reorder: when drag-reorder swaps look numbers on items, notes swap with them in the same transaction
- Fixes a subtle correctness bug — any feature keying data on `look_number` would silently attach data to wrong content after drag-reorder; RPC prevents this
- Also fixed: `supabase.rpc().catch()` TypeError (PostgrestFilterBuilder is PromiseLike, not a full Promise — must use `.then()`)
- Also fixed: dnd-kit "changed size between renders" warning — sync gate moved from sensors array length to `onDragStart`/`onDragEnd` handlers

### Scan In reference panel — grouped by Look (`fb185eb`)
- All three location views (At Studio, At Client, In Transit) in the Scan In reference panel now group items by Look, matching Shot List's convention
- Respects `lookOrder` drag order; multi-look items appear under each group; "No Look Assigned" at bottom
- Applies to desktop right panel, iPad portrait panel below scan card, and phone bottom sheet

### Manual item entry on Scan In (`bb463b6`)
- Scan-not-found on a non-unassigned shoot now opens an "Add item" modal instead of the old inline confirm card
- Modal fields: Barcode (prefilled from scan, or blank for manual), Style number (required), Description (optional)
- "+ Add item" text link for no-tag / manual-add (below scan buttons on desktop/iPad; in Settings panel on phone)
- Auto-generates `MANUAL-XXXXXX` barcode when field is left blank
- Scanner mode auto-refocus is suspended while modal is open so text fields are typeable
- Adds `manually_added` boolean to `StockItem` type, `mapItemToDB`, and `mapItemFromDB` — persists `manually_added = true` to DB for all manually created items (DB column already existed)

### Bug fixes
- Stock List "Reset to pending" clears looks (`edb04cc`) and persists to DB (`16e04c2`)

---

## Code health audit (June 2026)

### Inline styles audit
Total **~38 inline `style={{}}` usages** across 8 files. **All pages have zero or near-zero inline styles.** Outliers concentrated in components that predate or sit outside Phase D:

| File | Count | Notes |
|---|---|---|
| `PinEntryModal.tsx` | 13 | Not migrated — added during operator-system feature |
| `CameraScanner.tsx` | 12 | Camera overlay needs absolute positioning — likely intentional |
| `App.tsx` | 4 | Root-level, probably fine |
| `QRCode.tsx` | 3 | QR rendering, fine |
| `BulkStatusChangeView.tsx` | 2 | Stragglers, candidate for tidy-up |
| `ShotListView.tsx`, `ReportsView.tsx`, `ShootPicker.tsx` | 1 each | Tiny stragglers |

**Verdict:** Design system migration ~95% complete. Minor cleanup possible but not urgent.

### Emoji audit
Only **3 emoji remain** in source:
```
src/App.tsx:126                          📷  (loading state)
src/components/CameraScanner.tsx:102     📷  (camera hint UI)
src/components/CameraScanner.tsx:171     ⚠   (error message)
```
Worth replacing with Phosphor next time you touch these files. Low priority.

### TODOs
**Zero** `TODO`, `FIXME`, or `HACK` comments in source. Clean.

---

## Design tokens (`src/index.css`)

```css
@theme {
  /* Brand */
  --color-brand: #1C1C1E;
  --color-brand-fg: #FFFFFF;
  --color-accent: #7C3AED;

  /* Semantic */
  --color-success: #2E7D32;
  --color-warning: #E65100;  /* "At Client" */
  --color-info: #1565C0;     /* "In Transit" */
  --color-danger: #B71C1C;

  /* Surface */
  --color-surface: #FFFFFF;
  --color-surface-muted: #F5F5F5;
  --color-border: #E5E7EB;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 28px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}
```

Utility classes: `.touch-target` (min 44×44), `.pb-safe` (iPhone home indicator).

---

## Known issues / technical debt

### Supabase free-tier pausing (recurring risk)
- Free tier auto-pauses projects after ~7 days inactivity or when exceeding 2-active-project limit
- StockShot has been paused once (June 2026), restored from Supabase dashboard
- **If login shows "Failed to fetch":** check Supabase project status first — that's almost always the cause
- **Long-term:** upgrade to Supabase Pro ($25/mo) for production use, or set up a keep-alive ping

### Performance: Inter font loaded from external CDN
- Currently `@import url('https://rsms.me/inter/inter.css')` in `src/index.css`
- Render-blocking, external dependency, loads all font weights
- **Fix:** self-host via `@fontsource/inter`, only weights actually used (400, 500, 600, 700)
- ~30-min Claude Code job
- Probably contributing to perceived slow login-page load

### Performance: jsPDF in main bundle
- Converted to static import (`9a44542`) to fix stale-chunk errors after deploys
- Deliberate trade-off — bundle size for stability
- Possible mitigation: investigate proper code splitting with hash-stable chunks, but only if perf audit shows it's worth the complexity

### Pending design system migration
- `PinEntryModal.tsx` (13 inline styles) — added after Phase D
- `CameraScanner.tsx` (12 inline styles) — likely intentional for camera UI
- Three emoji in App.tsx and CameraScanner.tsx
- A handful of stragglers (1-2 inline styles each) in various pages
- **Total cleanup cost:** ~1-3 hours if comprehensive

### UX: sync triggers shipped, auto-refresh not yet
- Clickable sync indicator and re-click nav both shipped
- Window-focus auto-refresh not yet implemented (would complete the picture)
- Bigger picture: Supabase realtime subscription audit might eliminate manual sync need entirely

### Look-number is a position, not an identity
- Looks are integers (`shoots.look_order: number[]`, `stock_items.looks: number[]`) — there is no stable Look UUID
- Any feature that keys data on `look_number` (currently: `look_notes`) **must** be updated when drag-reorder changes look numbers
- Currently handled via `swap_look_notes` RPC. If another feature references Looks by number (shot templates, per-look counters, etc.), it needs the same RPC treatment
- If this pattern multiplies, the right long-term fix is migrating to stable UUID-based Look identity — see "Ideas" section

### RLS is on by default for new Supabase tables
- Any new table you create will reject all reads/writes until a policy is added
- For shoot-scoped tables the pattern is: `WHERE shoot_id IN (SELECT id FROM shoots WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))`
- Both `USING` (read) and `WITH CHECK` (write) clauses need this

### UX: scan input focus stealing on Scan In
- Scanner mode's auto-refocus behavior can block clicks into other fields on the same page (e.g. the Look notes input)
- Users learn to click somewhere neutral first to release scanner focus, then click the target field
- The Add Item modal suspends scanner mode entirely while open — this is the correct pattern for any future modal/overlay on Scan In
- Not a bug for normal usage — expected tradeoff of scanner-mode UX — but worth including in operator onboarding

### Known minor bug: Stock List last-item click unreliable on desktop
- The last item in the Stock List occasionally requires multiple clicks to expand
- Suspected cause: scroll container has no bottom padding, so the last row's click target sits right at the container's bottom edge
- Fix: add `pb-4` to the `flex-1 overflow-y-auto` scroll container in `StockListView.tsx`
- Deferred — low frequency, low impact

### Historic: Phase 3 regression — "Item found in a different shoot" false positives
- Briefly appeared after original Scan In rebuild
- Suspected stale local state vs Supabase realtime
- Reported as resolved during testing; worth monitoring

---

## What's NOT been done (out of scope or deferred)

- Accessibility audit (keyboard nav, screen reader, focus management, contrast)
- Dark mode (tokens ready, no dark variants added)
- Test suite (none exists)
- Sentry / error tracking
- Lighthouse / bundle perf audit
- Internationalization
- Phone responsive for pages other than Scan In/Out (intentional)
- Phone responsive for Admin / Missing / Dashboard / Import / Shoots — desktop and iPad only

---

## Authentication & infrastructure

### Two-layer auth model
1. **App-level login** (LoginView, Supabase auth via `src/lib/supabase.ts`) — Google OAuth or email/password — determines who can use the app
2. **Operator-level PIN** (`OperatorPinEntry.tsx` + `src/lib/auth.ts`) — determines *which operator* is performing scans, with Studio/Client role gating actions

The `at_studio` gate on ScanOutView is enforced via operator role at the component level. Worth preserving as a meaningful distinction in any future auth changes.

### GitHub
- Auth via `gh` CLI (OAuth, stored in macOS Keychain)
- Working directly on `main` (no PR workflow during beta)
- One personal access token leaked early in the project (June 2026), revoked immediately, switched to `gh` since

### Vercel
- Project: `stockshot-web` on Hobby/free tier
- Auto-deploys on push to `main`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` set for Production and Preview

### Supabase
- Free tier (2 active projects per org, auto-pauses after 7 days inactivity)
- Multiple Supabase projects in account — recurring pause risk
- Schema (inferred): items, shoots, looks, **operators (PIN + role)**, drops/batches, plus junction tables

---

## How to work on this app going forward

### Local dev
```
git checkout main
git pull
npm install
npm run dev
```

### Style rules (enforce in any new code)
- Tailwind classes only — no `style={{}}` objects
- No hex literals in JSX — go through `@theme` tokens
- All buttons via `<Button>` component
- All cards via `<Card>` component
- All inputs via `<Input>` component (use `scannerMode` for scan inputs)
- Phosphor icons only — no emoji
- Touch targets: `min-h-11` (44px) on tablet/mobile
- Inter font on body default — don't override `fontFamily` per element

### Working with Claude Code
- Use `gh` CLI for GitHub operations
- Currently on `main` — every push auto-deploys to live
- **Rule:** Do NOT push without explicit user approval
- For long git output: use `git --no-pager log ...` or pipe through `| cat`

---

## Suggested next steps (when ready)

In rough priority order:

1. **Self-host Inter font** — ~30 min, likely improves login-page perceived load time
2. **Audit Supabase realtime subscriptions** — proper data freshness eliminates manual-sync need, ~half day
3. **Auto-refresh on window focus** — ~1 hour, complements existing sync triggers
4. **Lighthouse audit on login page** — identify what's actually slow before guessing
5. **Migrate `PinEntryModal.tsx` to design system** — 30-60 min, last big inline-style holdout
6. **Replace remaining 3 emoji with Phosphor** — 15 min trivial task
7. **Real operator feedback iteration** — collect during beta, address ad-hoc
8. **Accessibility pass** — keyboard nav, contrast, focus rings
9. **Dark mode** — half day, tokens ready
10. **Sentry / error tracking** — ~1 hour setup

Lower priority:
- Test suite
- Code splitting strategy (only if bundle analysis shows it matters)
- Phone responsive for more pages (if usage patterns evolve)

### Discussed but not decided
- **UUID-based Look identity** — refactor to give each Look a stable UUID instead of relying on position-based numbers. Would eliminate the drag-reorder-plus-related-table-update pattern permanently. ~1 day of work; only worth doing if look-number-keyed features multiply.
- **Notes in Look Builder modal** — currently notes are only editable via Scan In. If operators want to edit notes without going to Scan In, Look Builder modal is the right place. Small addition.
- **Notes on Stock List / Labels PDF** — deliberately excluded from MVP. Add if operators ask for it.

---

## For starting a new Claude Code session

Sample first message:

> I'm working on StockShot, an internal beta app at github.com/patrickniland/stockshot-web. Stack: React 19 + Vite + Tailwind 4 + Supabase + Zustand, hosted on Vercel. Current version: 1.2.6.
>
> The app has been through extensive UX work: responsive rebuild of Scan In/Out with design system foundation, migration of all pages to the design system, PDF exports redesigned, sync UX improvements, and a PIN-authenticated operator system with Studio/Client roles. All merged to main.
>
> Working directly on main (beta phase). Every push auto-deploys to live via Vercel.
>
> Read `STOCKSHOT_PROJECT_STATUS.md` in the repo for full context.
>
> Today I want to: [task]
>
> Reminder: don't push without my explicit approval.

---

## Maintenance — refresh this doc

When you want an up-to-date snapshot, paste this block into Terminal:

```
cd ~/stockshot-web

echo "=== Recent commits ==="
git --no-pager log --oneline -30

echo ""
echo "=== File tree ==="
find src -type f \( -name "*.tsx" -o -name "*.ts" \) | sort

echo ""
echo "=== Inline styles per file ==="
grep -rc "style={{" src/ --include="*.tsx" | sort -t: -k2 -n -r | head -20

echo ""
echo "=== Remaining emoji ==="
grep -rn '📁\|📷\|📋\|🎬\|📦\|🚚\|⚠\|📊\|⚙\|🏠\|🏢\|🗂\|⬇' src/ --include="*.tsx" | head -20

echo ""
echo "=== TODOs ==="
grep -rn "TODO\|FIXME\|HACK" src/

echo ""
echo "=== Dependencies ==="
node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies).sort().join('\n'))"
```

Send the output to Claude and ask for a refreshed doc. Aim for monthly or after any major feature.

---

*This snapshot was verified against the codebase at commit `bb463b6` on August 19, 2026. Update timestamp and version when refreshing.*
