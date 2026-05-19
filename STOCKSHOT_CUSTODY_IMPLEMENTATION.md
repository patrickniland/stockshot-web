# StockShot — Custody Model Implementation Brief

**For:** Claude Code
**Project:** stockshot-web
**Date:** May 2026
**Scope:** Introduce custody location tracking, support multiple scan-in workflows (studio, client site, in-transit), add Unassigned shoot per client, update Shot List with location filter.

---

## Context

StockShot currently treats scan-in and scan-out as a single `status` field with three values: `pending`, `received`, `dispatched`. This conflates two different concepts:

1. **Shoot assignment** — which shoot an item belongs to (logical grouping)
2. **Physical custody** — where the item physically is right now

We are separating these concepts to support three real-world workflows:

1. Client sends stock to studio with a prescribed list (existing flow)
2. Stock arrives at studio without a pre-built list (new flow)
3. Client/staff use StockShot at the client site to build shoots and scan items in there (new flow)

A single shared login is used per client engagement. **No RLS, no role system, no multi-user invites.** Keep it simple.

---

## Goals

- Items have a `custody_location` separate from their shoot membership
- Scan In and Scan Out pages let the user choose the location context
- Items can be scanned in at the client site OR at the studio
- Stock arriving without a pre-built list goes into an "Unassigned" shoot per client
- Shot List shows all items in a shoot but can be filtered by custody location
- Each item has a small visual indicator showing its current location
- Workflow steps are optional — users can skip `in_transit` if not relevant
- Operator name captured per scan for basic audit trail

---

## Non-Goals

- No RLS implementation in this pass
- No role-based access control
- No multi-user / invite system
- No automatic notifications
- No cross-org sharing
- No changes to existing import flow

---

## Phase 1 — Database Changes

### 1.1 Wipe existing data

The user has confirmed a clean slate is acceptable.

```sql
TRUNCATE stock_items CASCADE;
TRUNCATE shoots CASCADE;
-- Keep: organisations, org_members, clients
```

### 1.2 Modify `stock_items` table

**Remove:**
- `status` column (was: pending/received/dispatched)
- `received_at` (replaced by custody_history)
- `dispatched_at` (replaced by custody_history)
- `dispatched_to` (replaced by custody_history entry)

**Add:**
- `custody_location` text — values: `with_client`, `in_transit`, `at_studio`, `dispatched_to_client`. Default: `with_client`.
- `custody_history` jsonb — array of events. Each event: `{ location, timestamp, operator, shoot_id, notes? }`. Default: `[]`.
- `last_scanned_at` timestamptz nullable
- `last_scanned_by` text nullable (operator name)

**Keep unchanged:**
- `shot_status` (notShot/shot/notRequired)
- `required_angles`, `completed_angles`
- `looks`, `product_type`
- All identifier fields (style_number, sku, qr_code_value, etc.)

### 1.3 Modify `shoots` table

**Add:**
- `is_unassigned` boolean default false — marks the special holding shoot per client

### 1.4 Auto-create Unassigned shoot per client

When a client is created (or for existing clients on migration), create one shoot:
- `name`: `"[ClientName] — Unassigned"`
- `client_id`: that client's id
- `is_unassigned`: true
- Cannot be deleted from the UI
- Cannot be renamed from the UI

If a client is deleted, its Unassigned shoot is deleted with it (cascade).

---

## Phase 2 — Type & Store Changes

### 2.1 Update TypeScript types

In `src/types/` (or wherever types live):

```typescript
export type CustodyLocation =
  | 'with_client'
  | 'in_transit'
  | 'at_studio'
  | 'dispatched_to_client';

export interface CustodyEvent {
  location: CustodyLocation;
  timestamp: string; // ISO
  operator: string;
  shoot_id: string;
  notes?: string;
}

export interface StockItem {
  // existing fields...
  custody_location: CustodyLocation;
  custody_history: CustodyEvent[];
  last_scanned_at: string | null;
  last_scanned_by: string | null;
  // remove: status, received_at, dispatched_at, dispatched_to
}
```

### 2.2 Update Zustand store

In `src/store/useAppStore.ts`:

**Remove or repurpose actions:**
- `markReceived` → replace with `setCustody`
- `markDispatched` → replace with `setCustody`

**Add new actions:**

```typescript
setCustody(itemId: string, location: CustodyLocation, operator: string, notes?: string): void
// Updates custody_location, appends to custody_history, updates last_scanned_*
// Persists to Supabase immediately (same pattern as current updateItemStatus)

bulkSetCustody(itemIds: string[], location: CustodyLocation, operator: string): void
// For Stock List "Mark all as at Studio" type actions

moveItemsToShoot(itemIds: string[], targetShootId: string): void
// For moving items out of Unassigned into a real shoot
```

**Add UI state:**
- `scanInLocation: CustodyLocation` — persisted in localStorage, default `at_studio`
- `scanOutLocation: CustodyLocation` — persisted in localStorage, default `in_transit`
- `currentOperator: string` — persisted in localStorage, default empty
- `shotListLocationFilter: CustodyLocation | 'all'` — default `at_studio`

---

## Phase 3 — Scan In Page Changes

File: `src/pages/ScanInView.tsx`

### 3.1 Add controls at top of page

Above the existing scanner UI, add a controls section:

```
┌────────────────────────────────────────────┐
│ Operator:  [Sarah               ▾]         │
│ Shoot:     [BrandX SS26         ▾]  ⊕ New │
│ Location:  [At Studio           ▾]         │
│ Look:      [◀]  Look 3  [▶]  ⊕ New        │
│ ☐ Mark as Shot on scan-in                  │
└────────────────────────────────────────────┘
```

**Location dropdown options:**
- At Studio (default)
- At Client Site

The Shoot dropdown should include Unassigned shoots for the current client, clearly labelled.

### 3.2 Scan action logic

When a barcode is scanned:

1. Find the item by barcode (existing normalisation logic)
2. If item is in another shoot already → show warning, ask to confirm move
3. If item not found anywhere:
   - If a real shoot is selected → ask "Add as new item to [Shoot]?"
   - If Unassigned shoot is selected → add immediately with minimal data (just the barcode)
4. Call `setCustody(itemId, scanInLocation, operator)`
5. If item now `at_studio`, log custody event with shoot_id
6. Show feedback as before (success / not found / already at this location)

### 3.3 Feedback states

- ✅ Scanned in to [Studio / Client Site] — green
- ⚠ Already at this location — amber
- ⚠ Item in different shoot ([X]) — amber, with "Move to current shoot?" action
- ❌ Not found — red, with "Add as new item?" action

### 3.4 Recent scans list

Show last 10 scans for this session. Each row: barcode/style, location set, time. Allow tap-to-undo (reverts to previous custody_location from history).

---

## Phase 4 — Scan Out Page Changes

File: `src/pages/ScanOutView.tsx`

### 4.1 Replace "dispatch recipient" with location selector

Remove the current "enter recipient name first" requirement. Replace with the same controls pattern as Scan In:

```
┌────────────────────────────────────────────┐
│ Operator:  [Sarah               ▾]         │
│ Shoot:     [BrandX SS26         ▾]         │
│ Out To:    [In Transit (to studio) ▾]      │
└────────────────────────────────────────────┘
```

**Out To dropdown options:**
- In Transit (to studio) — sets `custody_location = in_transit`
- In Transit (to client) — sets `custody_location = in_transit`
- Dispatched to Client — sets `custody_location = dispatched_to_client` (final)

Note: `in_transit` is a single state. The "to studio" vs "to client" distinction is captured in the `custody_history` event's `notes` field for context, but the location itself is just `in_transit`.

### 4.2 Validation

- Items can be scanned out from any current location (allow flexibility — no strict transitions)
- If scanning out an item that's already in_transit or dispatched, warn but allow
- Operator field required before scanning starts

### 4.3 Feedback states

Same pattern as Scan In, adjusted for outgoing context.

---

## Phase 5 — Shot List Changes

File: `src/pages/ShotListView.tsx`

### 5.1 Add custody location filter

Add a filter row at the top of the Shot List:

```
Location: [All] [At Studio] [With Client] [In Transit] [Dispatched]
```

- Pills/segmented control style
- Default: **At Studio** (most useful for photographer)
- Persists to store (`shotListLocationFilter`)
- Filter is applied **in addition to** existing filters (search, group by, etc.)

### 5.2 Item rows — add location indicator

Each item row in Shot List (and Stock List) should show a small icon indicating custody_location:

- 📦 `with_client` — at client site
- 🚚 `in_transit` — moving
- 🏠 `at_studio` — at studio
- ✅ `dispatched_to_client` — sent back

Place the icon next to the item identifier, subtle and grey when filter = "All".

### 5.3 Look Builder behaviour

Look Builder should **not** be affected by the location filter — it always shows the full shoot. Reason: planning looks against the complete inventory is the whole point of Look Builder, regardless of where stock physically is.

If "received only" toggle exists in Look Builder, repurpose to "At studio only" using `custody_location` instead of old `status`.

---

## Phase 6 — Stock List Changes

File: `src/pages/StockListView.tsx`

### 6.1 Replace status filter with custody filter

The current `All / Pending / Received / Dispatched` filter becomes:

`All / With Client / In Transit / At Studio / Dispatched`

### 6.2 Add bulk action: "Mark as at Studio"

When multiple items selected, expose a bulk action: **"Mark all as at Studio"** — for the case where a bulk delivery arrives and the operator wants to acknowledge it without scanning each item individually. Requires operator name and confirmation.

### 6.3 Add bulk action: "Move to shoot"

For items in the Unassigned shoot, allow bulk selection → "Move to shoot" → picks target shoot from dropdown → items relocated.

### 6.4 Item detail row — show custody_history

When a row is expanded, show the custody timeline:

```
History:
  10 May 09:15  Scanned at Client Site (Sarah)
  12 May 14:30  In Transit (to studio) (Sarah)
  13 May 10:02  At Studio (Tom)
```

Read-only. Useful for debugging or answering "where has this been?"

---

## Phase 7 — Dashboard Changes

File: `src/pages/ReportsView.tsx`

### 7.1 Replace existing KPI tiles

**Remove:**
- Received count
- Dispatched count

**Add:**
- At Studio — count of items currently at_studio
- With Client — count of items currently with_client
- In Transit — count of items currently in_transit
- Dispatched — count of items currently dispatched_to_client

**Keep:**
- Total Imported
- Shot / Not Shot / Shot N/A

### 7.2 Progress bar

Update progress bar logic to use new fields. Suggested: progress = (at_studio + in_transit + dispatched) / total_imported, where "with_client" represents items not yet in the studio flow.

---

## Phase 8 — Clients Page Changes

File: `src/pages/ClientsView.tsx`

### 8.1 Auto-create Unassigned shoot on client creation

When a new client is created, immediately create their Unassigned shoot. Trigger this in the same transaction.

### 8.2 Backfill for any existing clients

On app load, check each client for an existing Unassigned shoot. If none, create one. Idempotent.

---

## Phase 9 — Shoot Picker

Wherever a shoot dropdown appears (Scan In, Scan Out, Move to Shoot, etc.):

- List real shoots first, alphabetical
- Then a divider
- Then Unassigned shoots at the bottom, labelled clearly e.g. "Unassigned — BrandX"
- Unassigned shoots cannot be selected as the *target* for moving items out of themselves (avoid no-op)

---

## Phase 10 — Operator Name Capture

### 10.1 Where it lives

A single shared field at the top of Scan In and Scan Out pages. Persists per browser via localStorage. Pre-populated on next visit.

### 10.2 Format

Free-text input. No validation. Typical entries: "Sarah", "Tom", "Patrick".

### 10.3 Required

Required before any scan can be recorded. If empty, the scan input is disabled with a hint: "Enter operator name to begin scanning."

### 10.4 Where it shows up

- `custody_history` events (per scan)
- `last_scanned_by` on stock_items
- Recent scans list on scan pages
- Item detail expansion in Stock List

---

## Phase 11 — PDF / CSV Export Updates

### 11.1 Shot List PDF

Add an optional column: **Location** (with_client / in_transit / at_studio / dispatched). User can toggle inclusion.

### 11.2 CSV Export

Replace `status`, `received_at`, `dispatched_at`, `dispatched_to` columns with:
- `custody_location`
- `last_scanned_at`
- `last_scanned_by`

Custody history is omitted from default export but available via a "Detailed CSV" option that includes the full event log as a JSON string column.

---

## Testing Checklist

Before considering complete, manually verify:

1. **Scenario 1: Client sends list, stock arrives**
   - Import list to new shoot
   - Items default to `with_client`
   - Scan In page set to "At Studio" → scan items → items become `at_studio`
   - Shot List with default filter shows them

2. **Scenario 2: Stock arrives without list**
   - Open Scan In page
   - Pick "[ClientName] — Unassigned" shoot
   - Scan unknown barcode → prompt to add → adds to Unassigned, `at_studio`
   - Go to Stock List, find item in Unassigned, bulk select → Move to shoot → confirm → item moves

3. **Scenario 3: Build shoot at client site**
   - At client site, open Scan In page
   - Set location to "At Client Site"
   - Scan items → become `with_client`
   - Items appear on Shot List with `with_client` filter
   - Look Builder works (shows all items in shoot)
   - Later, at studio, items get scanned in → become `at_studio`

4. **Custody history**
   - For an item that has been scanned at client, in transit, then at studio:
   - Expand item in Stock List → see all three events with timestamps and operators

5. **Filter behaviour**
   - Shot List default filter = At Studio → only `at_studio` items visible
   - Switch to All → all items visible with location icons
   - Look Builder unaffected by filter

6. **Operator required**
   - Empty operator field → scan input disabled
   - Enter name → scanning enabled

7. **Edge cases**
   - Scan an item that's already at_studio → amber warning, not duplicated in history
   - Undo a recent scan → custody reverts, history entry removed
   - Delete a client → Unassigned shoot cascades

---

## Order of Implementation Suggested

1. Phase 1 (database) — get the schema right first
2. Phase 2 (types + store) — wire up the data layer
3. Phase 8 (Unassigned shoots) — create the holding state
4. Phase 3 + 4 (Scan In/Out) — the most important user-facing change
5. Phase 5 + 6 (Shot List + Stock List) — visibility and filters
6. Phase 9 + 10 (shoot picker + operator) — polish
7. Phase 7 (dashboard) — reporting catches up
8. Phase 11 (exports) — last because exports follow the data model

---

## Notes for Claude Code

- Existing sync architecture (manual push/pull, immediate save on scan) stays unchanged
- The hybrid sync model already handles the new fields without changes — `setCustody` follows the same pattern as `updateItemStatus`
- Keep all existing files and routes; this is an evolution, not a rebuild
- TypeScript strict mode — type all new fields properly
- Mobile responsiveness — scan pages are often used on tablets in the studio, keep controls thumb-friendly
- After Phase 1 (data wipe), the app should still load and not crash even if it points at the cleaned database
- Commit per phase if possible — easier to roll back a single phase than untangle a mega-commit

---

## Open Questions to Confirm Before Starting

1. **Confirm:** wipe data is acceptable — no production data needs preserving?
2. **Confirm:** scan barcode found in a *different* shoot than currently selected — warn and ask, or auto-move? Brief assumes warn-and-ask.
3. **Confirm:** look numbers — when items move between shoots (Unassigned → real shoot), should `looks` array be cleared? Brief assumes yes, cleared on move.
4. **Confirm:** undo last scan — implement now or defer? Brief includes it; can drop if scope-pressed.

---

*End of brief.*
