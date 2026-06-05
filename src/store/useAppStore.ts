// StockShot — Global App State

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Client, Shoot, StockItem, Drop, Operator,
  ScanFeedback, FeedbackType,
  ShotStatus, CustodyLocation, CustodyEvent,
} from '../types'
import { updateItemStatus, updateItemCustody, upsertItem, upsertItems, upsertShootMeta, upsertClient, deleteItem, fetchOperators, createOperatorDB, resetOperatorPinDB, setOperatorActiveDB, verifyOperatorPinDB } from '../lib/db'
import { supabase } from '../lib/supabase'

interface AppStore {
  clients: Client[]
  operators: Operator[]
  savedShoots: Shoot[]
  activeShootId: string | null
  orgId: string | null
  deletedShootIds: string[]
  deletedClientIds: string[]
  lastScanFeedback: ScanFeedback | null
  currentIntakeLook: number
  markShotOnScanIn: boolean

  // Custody UI state (persisted)
  scanInLocation: CustodyLocation
  scanOutLocation: CustodyLocation
  currentOperator: string
  shotListLocationFilter: CustodyLocation | 'all'
  stylingMode: boolean

  // Admin elevated session (in-memory only, never persisted)
  adminSessionExpiresAt: number | null
  adminSessionStartedAt: number | null
  adminPinAttemptsThisSession: number
  hasPinSet: boolean | null

  // Sync tracking
  dirtyItemIds: string[]
  syncStatus: 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  lastPulledAt: string | null

  getActiveShoot: () => Shoot | null
  getItems: () => StockItem[]
  getShot: () => StockItem[]
  getNotShot: () => StockItem[]
  getStudioQueue: () => StockItem[]
  clientName: (clientId: string | null) => string | null
  getClient: (clientId: string | null) => Client | null
  getActiveShoots: () => Shoot[]
  getTrashedShoots: () => Shoot[]
  findItemAcrossShoots: (itemId: string) => { item: StockItem; shootId: string } | null

  getPending: () => StockItem[]
  getReceived: () => StockItem[]
  getDispatched: () => StockItem[]
  pendingIsMeaningful: () => boolean

  addClient: (client: Client) => void
  updateClient: (client: Client) => void
  deleteClient: (clientId: string) => void

  addShoot: (shoot: Shoot) => void
  addShootToList: (shoot: Shoot) => void
  switchToShoot: (shoot: Shoot) => void
  softDeleteShoot: (shoot: Shoot) => void
  restoreShoot: (shoot: Shoot) => void
  permanentlyDeleteShoot: (shoot: Shoot) => void
  deleteShoot: (shoot: Shoot) => void
  renameActiveShoot: (name: string) => void
  updateShootItems: (items: StockItem[]) => void
  addDropToActiveShoot: (drop: Drop, items: StockItem[]) => void
  clearActiveShoot: () => void
  bumpLook: () => void
  reorderLook: (lookA: number, lookB: number) => void

  updateItem: (itemId: string, updates: Partial<StockItem>) => void
  assignProductType: (itemId: string, productType: string) => void
  toggleAngle: (itemId: string, angle: string) => void
  bulkAssignProductType: (itemIds: string[], productType: string) => void

  setCustody: (itemId: string, location: CustodyLocation, operator: string, shootId?: string, notes?: string) => void
  bulkSetCustody: (itemIds: string[], location: CustodyLocation, operator: string, notes?: string) => void
  commitScanIn: (itemId: string, shootId: string, location: CustodyLocation, operator: string, looks: number[], shotStatus?: ShotStatus) => void
  moveItemsToShoot: (itemIds: string[], targetShootId: string) => void
  addItemToShoot: (item: StockItem, shootId: string) => void
  removeItemFromShoot: (itemId: string, shootId: string) => void
  restoreItemState: (itemId: string, updates: Partial<StockItem>) => void

  scanIn: (sku: string) => void
  scanOut: (sku: string, to: string) => void

  setShoots: (shoots: Shoot[]) => void
  migrateLocations: () => void
  setClients: (clients: Client[]) => void
  setActiveShootId: (id: string) => void
  setOrgId: (id: string) => void
  setMarkShotOnScanIn: (val: boolean) => void
  setCurrentIntakeLook: (val: number) => void
  setLastScanFeedback: (val: ScanFeedback | null) => void
  setScanInLocation: (val: CustodyLocation) => void
  setScanOutLocation: (val: CustodyLocation) => void
  setCurrentOperator: (val: string) => void
  setShotListLocationFilter: (val: CustodyLocation | 'all') => void
  setStylingMode: (val: boolean) => void
  resetStore: () => void

  // Operator actions
  loadOperators: () => Promise<void>
  createOperator: (name: string, pin: string) => Promise<void>
  resetOperatorPin: (operatorId: string, newPin: string) => Promise<void>
  setOperatorActive: (operatorId: string, isActive: boolean) => Promise<void>
  verifyOperatorPin: (pin: string) => Promise<{ ok: boolean; name?: string }>

  // Admin PIN actions
  verifyPin: (pin: string) => Promise<{ ok: boolean; lockedUntil?: Date }>
  lockAdminNow: () => void
  isAdminElevated: () => boolean
  setupInitialPin: (pin: string) => Promise<void>
  resetPinViaPassword: (currentPassword: string, newPin: string) => Promise<void>
  checkHasPin: () => Promise<void>
  grantAdminSession: () => void

  // Sync actions
  markDirty: (itemId: string) => void
  clearDirty: (itemIds: string[]) => void
  clearDeletedShootIds: (ids: string[]) => void
  clearDeletedClientIds: (ids: string[]) => void
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void
  setLastSyncedAt: (ts: string | null) => void
  setLastPulledAt: (ts: string | null) => void
  mergeItems: (updates: Array<{ item: StockItem; shootId: string }>) => void
  mergeShoots: (updates: Array<Omit<Shoot, 'items'>>, newShootsWithItems: Shoot[]) => void
}

// ── Barcode normalisation ─────────────────────────────────────────────────────
function normaliseScan(raw: string): string {
  const t = raw.trim()
  const parts = t.split('-')
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) return parts[1]
  if (/^\d+$/.test(t) && t.length >= 4) return t.slice(2, -1)
  return t
}

function findItem(items: StockItem[], query: string): StockItem | undefined {
  const raw = query.trim()
  const norm = normaliseScan(raw).toLowerCase()
  const rawL = raw.toLowerCase()
  return items.find(i => {
    const extras = Object.values(i.extraFields).map(v => v.toLowerCase())
    return (
      i.sku.toLowerCase() === rawL || i.sku.toLowerCase() === norm ||
      i.qrCodeValue.toLowerCase() === rawL || i.qrCodeValue.toLowerCase() === norm ||
      i.styleNumber.toLowerCase() === rawL || i.styleNumber.toLowerCase() === norm ||
      extras.some(v => v === rawL || v === norm)
    )
  })
}

function fb(type: FeedbackType, message: string, scannedValue: string): ScanFeedback {
  return { id: Date.now().toString(), type, message, scannedValue }
}

// ── Store ─────────────────────────────────────────────────────────────────────
const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      clients: [],
      savedShoots: [],
      operators: [],
      activeShootId: null,
      orgId: null,
      deletedShootIds: [],
      deletedClientIds: [],
      lastScanFeedback: null,
      currentIntakeLook: 0,
      markShotOnScanIn: false,
      scanInLocation: 'at_studio',
      scanOutLocation: 'in_transit',
      currentOperator: '',
      shotListLocationFilter: 'all',
      stylingMode: false,
      adminSessionExpiresAt: null,
      adminSessionStartedAt: null,
      adminPinAttemptsThisSession: 0,
      hasPinSet: null,
      dirtyItemIds: [],
      syncStatus: 'idle',
      lastSyncedAt: null,
      lastPulledAt: null,

      // ── Derived ───────────────────────────────────────────
      getActiveShoot: () => {
        const { savedShoots, activeShootId } = get()
        return savedShoots.find(s => s.id === activeShootId) ?? null
      },
      getItems: () => get().getActiveShoot()?.items ?? [],
      getShot: () => get().getItems().filter(i => i.shotStatus === 'shot'),
      getNotShot: () => get().getItems().filter(i => i.shotStatus === 'notShot'),
      getStudioQueue: () => get().getItems().filter(i =>
        i.custodyLocation === 'at_studio' &&
        i.shotStatus === 'notShot' &&
        (i.custodyHistory ?? []).length > 0
      ),
      clientName: (id) => id ? (get().clients.find(c => c.id === id)?.name ?? null) : null,
      getClient: (id) => id ? (get().clients.find(c => c.id === id) ?? null) : null,
      getActiveShoots: () => get().savedShoots.filter(s => !s.deletedAt),
      getTrashedShoots: () => {
        const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        return get().savedShoots.filter(s => s.deletedAt && s.deletedAt > ago)
      },
      findItemAcrossShoots: (itemId) => {
        for (const shoot of get().savedShoots) {
          const item = shoot.items.find(i => i.id === itemId)
          if (item) return { item, shootId: shoot.id }
        }
        return null
      },

      getPending: () => get().getItems().filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length === 0),
      getReceived: () => get().getItems().filter(i => i.custodyLocation === 'at_studio'),
      getDispatched: () => get().getItems().filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0),
      pendingIsMeaningful: () =>
        get().getActiveShoot()?.drops.some(d => d.importMode === 'jobList') ?? false,

      // ── Clients ───────────────────────────────────────────
      addClient: (client) => {
        set(s => ({ clients: [...s.clients, client] }))
        const { orgId } = get()
        if (orgId) upsertClient(client, orgId).catch(e => console.error('[Sync] addClient error — code:', e?.code, '| message:', e?.message))
      },
      updateClient: (client) => {
        set(s => {
          const clients = s.clients.map(c => c.id === client.id ? client : c)
          const savedShoots = s.savedShoots.map(shoot => {
            if (shoot.clientId !== client.id) return shoot
            const items = shoot.items.map(item => {
              if (!item.productType) return item
              const pt = client.productTypes.find(p =>
                p.name.toLowerCase() === item.productType!.toLowerCase() ||
                p.aliases?.some(a => a.toLowerCase() === item.productType!.toLowerCase())
              )
              if (!pt) return item
              const newAngles = pt.requiredAngles.map(a => a.name)
              if (JSON.stringify(newAngles) === JSON.stringify(item.requiredAngles)) return item
              return { ...item, requiredAngles: newAngles }
            })
            return { ...shoot, items, updatedAt: new Date().toISOString() }
          })
          return { clients, savedShoots }
        })
        const { orgId } = get()
        if (orgId) upsertClient(client, orgId).catch(e => console.error('[Sync] updateClient error — code:', e?.code, '| message:', e?.message))
      },
      deleteClient: (clientId) => set(s => {
        const unassignedIds = s.savedShoots
          .filter(sh => sh.clientId === clientId && sh.isUnassigned)
          .map(sh => sh.id)
        return {
          clients: s.clients.filter(c => c.id !== clientId),
          deletedClientIds: [...s.deletedClientIds, clientId],
          savedShoots: s.savedShoots.filter(sh => !(sh.clientId === clientId && sh.isUnassigned)),
          deletedShootIds: [...s.deletedShootIds, ...unassignedIds],
        }
      }),

      // ── Shoots ────────────────────────────────────────────
      addShoot: (shoot) => set(s => ({
        savedShoots: [...s.savedShoots, { ...shoot, deletedAt: null }],
        activeShootId: shoot.id,
      })),

      addShootToList: (shoot) => set(s => ({
        savedShoots: [...s.savedShoots, { ...shoot, deletedAt: null }],
      })),

      switchToShoot: (shoot) => set({ activeShootId: shoot.id, currentIntakeLook: 0 }),

      softDeleteShoot: (shoot) => {
        const { savedShoots, activeShootId, orgId } = get()
        const updatedShoot = { ...shoot, deletedAt: new Date().toISOString() }
        const updated = savedShoots.map(sh => sh.id === shoot.id ? updatedShoot : sh)
        const remaining = updated.filter(sh => !sh.deletedAt)
        set({
          savedShoots: updated,
          activeShootId: activeShootId === shoot.id ? (remaining[0]?.id ?? null) : activeShootId,
        })
        if (orgId) upsertShootMeta(updatedShoot, orgId).catch(e => console.error('[Sync] softDeleteShoot error:', e))
      },

      restoreShoot: (shoot) => {
        const { orgId } = get()
        const updatedShoot = { ...shoot, deletedAt: null }
        set(s => ({
          savedShoots: s.savedShoots.map(sh => sh.id === shoot.id ? updatedShoot : sh),
        }))
        if (orgId) upsertShootMeta(updatedShoot, orgId).catch(e => console.error('[Sync] restoreShoot error:', e))
      },

      permanentlyDeleteShoot: (shoot) => set(s => {
        const remaining = s.savedShoots.filter(sh => sh.id !== shoot.id)
        return {
          savedShoots: remaining,
          activeShootId: s.activeShootId === shoot.id
            ? (remaining.filter(sh => !sh.deletedAt)[0]?.id ?? null) : s.activeShootId,
          deletedShootIds: [...s.deletedShootIds, shoot.id],
        }
      }),

      deleteShoot: (shoot) => set(s => {
        const remaining = s.savedShoots.filter(x => x.id !== shoot.id)
        return {
          savedShoots: remaining,
          activeShootId: remaining[0]?.id ?? null,
          deletedShootIds: [...s.deletedShootIds, shoot.id],
        }
      }),

      renameActiveShoot: (name) => {
        const { savedShoots, activeShootId, orgId } = get()
        const now = new Date().toISOString()
        const updated = savedShoots.map(sh =>
          sh.id === activeShootId ? { ...sh, name, updatedAt: now } : sh
        )
        set({ savedShoots: updated })
        if (orgId && activeShootId) {
          const updatedShoot = updated.find(sh => sh.id === activeShootId)
          if (updatedShoot) upsertShootMeta(updatedShoot, orgId).catch(e => console.error('[Sync] renameActiveShoot error:', e))
        }
      },

      updateShootItems: (items) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, items, updatedAt: new Date().toISOString() } : sh
        ),
      })),

      addDropToActiveShoot: (drop, items) => set(s => ({
        savedShoots: s.savedShoots.map(sh => {
          if (sh.id !== s.activeShootId) return sh
          return {
            ...sh,
            items: [...sh.items, ...items],
            drops: [...sh.drops, drop],
            updatedAt: new Date().toISOString(),
          }
        }),
      })),

      clearActiveShoot: () => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, items: [], drops: [], updatedAt: new Date().toISOString() } : sh
        ),
      })),

      bumpLook: () => {
        const { savedShoots, activeShootId, orgId, currentIntakeLook } = get()
        const newLook = currentIntakeLook + 1
        const updated = savedShoots.map(sh => {
          if (sh.id !== activeShootId) return sh
          const lookOrder = sh.lookOrder.includes(newLook)
            ? sh.lookOrder
            : [...sh.lookOrder, newLook].sort((a, b) => a - b)
          return { ...sh, lookOrder, updatedAt: new Date().toISOString() }
        })
        set({ currentIntakeLook: newLook, savedShoots: updated })
        if (orgId && activeShootId) {
          const updatedShoot = updated.find(sh => sh.id === activeShootId)
          if (updatedShoot) {
            upsertShootMeta(updatedShoot, orgId)
              .catch(e => console.error('[Sync] bumpLook error:', e))
          }
        }
      },

      reorderLook: (lookA, lookB) => {
        const { savedShoots, activeShootId, orgId } = get()
        const sh = savedShoots.find(x => x.id === activeShootId)
        if (!sh || !activeShootId) return
        // Ensure both look numbers are tracked before swapping — a look may exist
        // only in items (added via direct assignment) and be absent from lookOrder
        let baseOrder = sh.lookOrder
        if (!baseOrder.includes(lookA)) baseOrder = [...baseOrder, lookA].sort((a, b) => a - b)
        if (!baseOrder.includes(lookB)) baseOrder = [...baseOrder, lookB].sort((a, b) => a - b)
        const swap = (n: number) => n === lookA ? lookB : n === lookB ? lookA : n
        const items = sh.items.map(item => ({
          ...item,
          looks: item.looks.map(swap).sort((a, b) => a - b),
        }))
        const lookOrder = baseOrder.map(swap).sort((a, b) => a - b)
        const updatedShoot = { ...sh, items, lookOrder, updatedAt: new Date().toISOString() }
        set({
          savedShoots: savedShoots.map(x => x.id === activeShootId ? updatedShoot : x),
        })
        if (orgId) {
          upsertShootMeta(updatedShoot, orgId)
            .catch(e => console.error('[Sync] reorderLook shoot error:', e))
          // Only push items whose looks array actually changed
          const changedItemIds = sh.items
            .filter(i => i.looks.includes(lookA) !== i.looks.includes(lookB))
            .map(i => i.id)
          if (changedItemIds.length > 0) {
            changedItemIds.forEach(id => get().markDirty(id))
            const changedItems = items.filter(i => changedItemIds.includes(i.id))
            upsertItems(changedItems, activeShootId, orgId)
              .then(() => get().clearDirty(changedItemIds))
              .catch(() => {/* stays dirty, retried on next nav */})
          }
        }
      },

      // ── Item actions ──────────────────────────────────────
      updateItem: (itemId, updates) => {
        const { orgId, activeShootId } = get()
        const items = get().getItems().map(i => i.id === itemId ? { ...i, ...updates } : i)
        get().updateShootItems(items)
        get().markDirty(itemId)
        if (orgId && activeShootId) {
          const updated = items.find(i => i.id === itemId)
          if (updated) {
            upsertItem(updated, activeShootId, orgId)
              .then(() => get().clearDirty([itemId]))
              .catch(() => {/* stays dirty, retried on next nav */})
          }
        }
      },

      assignProductType: (itemId, productType) => {
        const { orgId, activeShootId } = get()
        const shoot = get().getActiveShoot()
        const client = get().getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        const items = get().getItems().map(i => i.id === itemId ? { ...i, productType, requiredAngles } : i)
        get().updateShootItems(items)
        get().markDirty(itemId)
        if (orgId && activeShootId) {
          const updated = items.find(i => i.id === itemId)
          if (updated) {
            upsertItem(updated, activeShootId, orgId)
              .then(() => get().clearDirty([itemId]))
              .catch(() => {})
          }
        }
      },

      toggleAngle: (itemId, angle) => {
        const { orgId, activeShootId } = get()
        const items = get().getItems().map(i => {
          if (i.id !== itemId) return i
          const completed = i.completedAngles.includes(angle)
            ? i.completedAngles.filter(a => a !== angle)
            : [...i.completedAngles, angle]
          const allDone = i.requiredAngles.length > 0 &&
            i.requiredAngles.every(a => completed.includes(a))
          const newShotStatus = allDone ? 'shot' as ShotStatus
            : i.shotStatus === 'notRequired' ? 'notRequired' as ShotStatus
            : 'notShot' as ShotStatus
          return {
            ...i,
            completedAngles: completed,
            shotStatus: newShotStatus,
            shotAt: allDone ? new Date().toISOString() : null,
          }
        })
        get().updateShootItems(items)
        get().markDirty(itemId)
        if (orgId && activeShootId) {
          const updated = items.find(i => i.id === itemId)
          if (updated) {
            upsertItem(updated, activeShootId, orgId)
              .then(() => get().clearDirty([itemId]))
              .catch(() => {})
          }
        }
      },

      bulkAssignProductType: (itemIds, productType) => {
        const { orgId, activeShootId } = get()
        const shoot = get().getActiveShoot()
        const client = get().getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        const allItems = get().getItems()
        const updatedItems = allItems.map(i =>
          itemIds.includes(i.id) ? { ...i, productType, requiredAngles } : i
        )
        get().updateShootItems(updatedItems)
        itemIds.forEach(id => get().markDirty(id))
        if (orgId && activeShootId) {
          const toUpsert = updatedItems.filter(i => itemIds.includes(i.id))
          upsertItems(toUpsert, activeShootId, orgId)
            .then(() => get().clearDirty(itemIds))
            .catch(() => {})
        }
      },

      // ── Custody actions ───────────────────────────────────
      setCustody: (itemId, location, operator, shootId, notes) => {
        const { savedShoots } = get()
        const now = new Date().toISOString()

        let foundShootId = shootId ?? null
        let foundItem: StockItem | null = null

        for (const shoot of savedShoots) {
          const item = shoot.items.find(i => i.id === itemId)
          if (item) {
            foundItem = item
            if (!foundShootId) foundShootId = shoot.id
            break
          }
        }
        if (!foundItem || !foundShootId) return

        const event: CustodyEvent = {
          location,
          timestamp: now,
          operator,
          shoot_id: foundShootId,
          ...(notes ? { notes } : {}),
        }

        const updatedItem: StockItem = {
          ...foundItem,
          custodyLocation: location,
          custodyHistory: [...(foundItem.custodyHistory ?? []), event],
          lastScannedAt: now,
          lastScannedBy: operator,
        }

        set({
          savedShoots: savedShoots.map(shoot =>
            shoot.id === foundShootId
              ? { ...shoot, items: shoot.items.map(i => i.id === itemId ? updatedItem : i) }
              : shoot
          ),
        })

        // Use upsertItem so the row is created in DB if it doesn't exist yet
        // (can happen when the shoot's initial import save failed).
        // First ensure the shoot itself exists, then upsert the item.
        const { orgId } = get()
        if (orgId) {
          const parentShoot = get().savedShoots.find(s => s.id === foundShootId)
          const doSync = async () => {
            if (parentShoot) {
              // Ensure client exists in DB if shoot has one
              if (parentShoot.clientId) {
                const client = get().clients.find(c => c.id === parentShoot.clientId)
                if (client) await upsertClient(client, orgId)
              }
              await upsertShootMeta(parentShoot, orgId)
            }
            await upsertItem(updatedItem, foundShootId!, orgId)
          }
          doSync().catch(e => console.error('[Sync] setCustody error — code:', e?.code, '| message:', e?.message))
        }
      },

      bulkSetCustody: (itemIds, location, operator, notes?) => {
        itemIds.forEach(id => get().setCustody(id, location, operator, undefined, notes))
      },

      commitScanIn: (itemId, shootId, location, operator, looks, shotStatus?) => {
        const { savedShoots, orgId } = get()
        const now = new Date().toISOString()

        let foundItem: StockItem | null = null
        for (const shoot of savedShoots) {
          const item = shoot.items.find(i => i.id === itemId)
          if (item) { foundItem = item; break }
        }
        if (!foundItem) return

        const event: CustodyEvent = { location, timestamp: now, operator, shoot_id: shootId }
        const updatedItem: StockItem = {
          ...foundItem,
          custodyLocation: location,
          custodyHistory: [...(foundItem.custodyHistory ?? []), event],
          lastScannedAt: now,
          lastScannedBy: operator,
          looks,
          ...(shotStatus !== undefined ? { shotStatus } : {}),
        }

        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === shootId
              ? { ...sh, items: sh.items.map(i => i.id === itemId ? updatedItem : i) }
              : sh
          ),
        }))

        if (orgId) {
          upsertItem(updatedItem, shootId, orgId)
            .catch(e => console.error('[Sync] commitScanIn error:', e))
        }
      },

      moveItemsToShoot: (itemIds, targetShootId) => {
        const { savedShoots, orgId } = get()
        if (!orgId) return

        const movedItems: StockItem[] = []

        const withItemsRemoved = savedShoots.map(shoot => {
          const toMove = shoot.items.filter(i => itemIds.includes(i.id))
          if (toMove.length === 0) return shoot
          movedItems.push(...toMove.map(i => ({ ...i, looks: [] })))
          return { ...shoot, items: shoot.items.filter(i => !itemIds.includes(i.id)) }
        })

        const updatedShoots = withItemsRemoved.map(shoot =>
          shoot.id === targetShootId
            ? { ...shoot, items: [...shoot.items, ...movedItems] }
            : shoot
        )

        set({ savedShoots: updatedShoots })

        movedItems.forEach(item => {
          upsertItem(item, targetShootId, orgId)
            .catch(e => console.error('[Sync] moveItemsToShoot error:', e))
        })
      },

      addItemToShoot: (item, shootId) => {
        const { savedShoots, orgId } = get()
        if (!orgId) return
        // Bail if the target shoot already has an item with the same barcode
        const targetShoot = savedShoots.find(s => s.id === shootId)
        const alreadyExists = targetShoot?.items.some(i =>
          (item.sku       && i.sku       === item.sku)       ||
          (item.qrCodeValue && i.qrCodeValue === item.qrCodeValue) ||
          (item.styleNumber && i.styleNumber === item.styleNumber)
        )
        if (alreadyExists) return
        set({
          savedShoots: savedShoots.map(shoot =>
            shoot.id === shootId
              ? { ...shoot, items: [...shoot.items, item], updatedAt: new Date().toISOString() }
              : shoot
          ),
        })
        upsertItem(item, shootId, orgId)
          .catch(e => console.error('[Sync] addItemToShoot error:', e))
      },

      removeItemFromShoot: (itemId, shootId) => {
        const { orgId } = get()
        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === shootId
              ? { ...sh, items: sh.items.filter(i => i.id !== itemId) }
              : sh
          ),
        }))
        if (orgId) {
          deleteItem(itemId).catch(e => console.error('[Sync] removeItemFromShoot error:', e))
        }
      },

      restoreItemState: (itemId, updates) => {
        const { savedShoots } = get()
        set({
          savedShoots: savedShoots.map(shoot => ({
            ...shoot,
            items: shoot.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
          })),
        })
        if (updates.custodyLocation !== undefined) {
          updateItemCustody(itemId, {
            custodyLocation: updates.custodyLocation,
            custodyHistory: updates.custodyHistory ?? [],
            lastScannedAt: updates.lastScannedAt,
            lastScannedBy: updates.lastScannedBy,
          }).catch(e => console.error('[Sync] restoreItemState error:', e))
        }
        if (updates.looks !== undefined) {
          updateItemStatus(itemId, { looks: updates.looks })
            .catch(e => console.error('[Sync] restoreItemState looks error:', e))
        }
      },

      // ── Legacy scan actions ───────────────────────────────
      scanIn: (sku) => {
        const { getItems, updateShootItems, markShotOnScanIn, currentIntakeLook } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) { set({ lastScanFeedback: fb('notFound', 'Item not found', sku) }); return }

        const now = new Date().toISOString()
        const looks = currentIntakeLook > 0
          ? (item.looks.includes(currentIntakeLook) ? item.looks : [...item.looks, currentIntakeLook])
          : item.looks

        const updatedItem: StockItem = {
          ...item,
          custodyLocation: 'at_studio',
          lastScannedAt: now,
          lastScannedBy: '',
          looks,
          shotStatus: markShotOnScanIn ? 'shot' as ShotStatus : item.shotStatus,
          shotAt: markShotOnScanIn ? now : item.shotAt,
          completedAngles: markShotOnScanIn ? item.requiredAngles : item.completedAngles,
        }

        updateShootItems(items.map(i => i.id === item.id ? updatedItem : i))
        set({ lastScanFeedback: fb('success', markShotOnScanIn ? 'Received + Shot' : 'Received', sku) })

        updateItemStatus(item.id, {
          shotStatus: updatedItem.shotStatus,
          shotAt: updatedItem.shotAt,
          looks: updatedItem.looks,
          completedAngles: updatedItem.completedAngles,
        }).catch(e => console.error('[Sync] scanIn error:', e))
      },

      scanOut: (sku, _to) => {
        const { getItems, updateShootItems } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) { set({ lastScanFeedback: fb('notFound', 'Item not found', sku) }); return }

        const now = new Date().toISOString()
        const updatedItem: StockItem = {
          ...item,
          custodyLocation: 'at_client',
          lastScannedAt: now,
          lastScannedBy: '',
        }
        updateShootItems(items.map(i => i.id === item.id ? updatedItem : i))
        set({ lastScanFeedback: fb('success', 'At Client', sku) })

        updateItemCustody(item.id, {
          custodyLocation: 'at_client',
          custodyHistory: updatedItem.custodyHistory,
          lastScannedAt: now,
          lastScannedBy: '',
        }).catch(e => console.error('[Sync] scanOut error:', e))
      },

      // ── Sync actions ──────────────────────────────────────
      setShoots: (shoots) => set({ savedShoots: shoots }),
      migrateLocations: () => {
        const migrateL = (loc: string): CustodyLocation => {
          if (loc === 'with_client' || loc === 'dispatched_to_client') return 'at_client'
          return loc as CustodyLocation
        }
        const { savedShoots } = get()
        const migrated = savedShoots.map(shoot => ({
          ...shoot,
          items: shoot.items.map(item => ({
            ...item,
            custodyLocation: migrateL(item.custodyLocation),
            custodyHistory: (item.custodyHistory ?? []).map(e => ({ ...e, location: migrateL(e.location) })),
          })),
        }))
        set({ savedShoots: migrated })
      },
      setClients: (clients) => set({ clients }),
      setActiveShootId: (id) => set({ activeShootId: id }),
      setOrgId: (id) => set({ orgId: id }),
      resetStore: () => set({
        clients: [], savedShoots: [], activeShootId: null, orgId: null,
        deletedShootIds: [], deletedClientIds: [], lastScanFeedback: null,
        dirtyItemIds: [], syncStatus: 'idle', lastSyncedAt: null, lastPulledAt: null,
        adminSessionExpiresAt: null, adminSessionStartedAt: null,
        adminPinAttemptsThisSession: 0, hasPinSet: null,
      }),
      setMarkShotOnScanIn: (val) => set({ markShotOnScanIn: val }),
      setCurrentIntakeLook: (val) => set({ currentIntakeLook: val }),
      setLastScanFeedback: (val) => set({ lastScanFeedback: val }),
      setStylingMode: (val) => set({ stylingMode: val }),

      // ── Operator actions ──────────────────────────────────
      loadOperators: async () => {
        const { orgId } = get()
        if (!orgId) return
        try {
          const ops = await fetchOperators(orgId)
          set({ operators: ops })
        } catch (e) {
          console.error('[Operators] load failed:', e)
        }
      },

      createOperator: async (name, pin) => {
        const { orgId } = get()
        if (!orgId) throw new Error('No org')
        const id = await createOperatorDB(orgId, name, pin)
        const newOp: Operator = { id, orgId, name, isActive: true, createdAt: new Date().toISOString() }
        set(s => ({ operators: [...s.operators, newOp] }))
      },

      resetOperatorPin: async (operatorId, newPin) => {
        await resetOperatorPinDB(operatorId, newPin)
      },

      setOperatorActive: async (operatorId, isActive) => {
        await setOperatorActiveDB(operatorId, isActive)
        set(s => ({
          operators: s.operators.map(o => o.id === operatorId ? { ...o, isActive } : o),
        }))
      },

      verifyOperatorPin: async (pin) => {
        const { orgId } = get()
        if (!orgId) return { ok: false }
        try {
          const name = await verifyOperatorPinDB(orgId, pin)
          if (name) {
            set({ currentOperator: name })
            return { ok: true, name }
          }
          return { ok: false }
        } catch (e) {
          console.error('[Operators] verify failed:', e)
          return { ok: false }
        }
      },

      // ── Admin PIN actions ─────────────────────────────────
      grantAdminSession: () => set({
        adminSessionExpiresAt: Date.now() + 30 * 60 * 1000,
        adminSessionStartedAt: Date.now(),
        adminPinAttemptsThisSession: 0,
        hasPinSet: true,
      }),

      isAdminElevated: () => {
        const exp = get().adminSessionExpiresAt
        return exp !== null && exp > Date.now()
      },

      lockAdminNow: () => set({ adminSessionExpiresAt: null }),

      verifyPin: async (pin) => {
        try {
          const { data, error } = await supabase.rpc('verify_admin_pin', { pin })
          if (error) {
            // Server threw — check if it's a lockout message
            const msg = error.message ?? ''
            const match = msg.match(/PIN locked until (.+)/)
            if (match) {
              return { ok: false, lockedUntil: new Date(match[1]) }
            }
            return { ok: false }
          }
          if (data === true) {
            get().grantAdminSession()
            return { ok: true }
          }
          set(s => ({ adminPinAttemptsThisSession: s.adminPinAttemptsThisSession + 1 }))
          return { ok: false }
        } catch {
          return { ok: false }
        }
      },

      setupInitialPin: async (pin) => {
        const { error } = await supabase.rpc('set_admin_pin', { new_pin: pin })
        if (error) throw new Error(error.message)
        get().grantAdminSession()
      },

      resetPinViaPassword: async (currentPassword, newPin) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.email) throw new Error('No email on account — cannot reset via password')
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        })
        if (authError) throw new Error('Incorrect password')
        const { error } = await supabase.rpc('reset_admin_pin', { new_pin: newPin })
        if (error) throw new Error(error.message)
        get().grantAdminSession()
      },

      checkHasPin: async () => {
        const { data, error } = await supabase.rpc('check_has_admin_pin')
        if (!error) set({ hasPinSet: data === true })
      },
      setScanInLocation: (val) => set({ scanInLocation: val }),
      setScanOutLocation: (val) => set({ scanOutLocation: val }),
      setCurrentOperator: (val) => set({ currentOperator: val }),
      setShotListLocationFilter: (val) => set({ shotListLocationFilter: val }),

      markDirty: (itemId) => set(s => ({
        dirtyItemIds: s.dirtyItemIds.includes(itemId)
          ? s.dirtyItemIds
          : [...s.dirtyItemIds, itemId],
      })),
      clearDirty: (itemIds) => set(s => ({
        dirtyItemIds: s.dirtyItemIds.filter(id => !itemIds.includes(id)),
      })),
      clearDeletedShootIds: (ids) => set(s => ({
        deletedShootIds: s.deletedShootIds.filter(id => !ids.includes(id)),
      })),
      clearDeletedClientIds: (ids) => set(s => ({
        deletedClientIds: s.deletedClientIds.filter(id => !ids.includes(id)),
      })),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),
      setLastPulledAt: (ts) => set({ lastPulledAt: ts }),
      mergeItems: (updates) => set(s => {
        // Build a map of itemId → its authoritative shoot per DB
        const itemShootMap = new Map(updates.map(u => [u.item.id, u.shootId]))

        return {
          savedShoots: s.savedShoots.map(shoot => {
            const shootUpdates = updates.filter(u => u.shootId === shoot.id)

            // Remove stale copies of items that DB says now belong to a different shoot
            const baseItems = shoot.items.filter(i => {
              const correctShoot = itemShootMap.get(i.id)
              return correctShoot === undefined || correctShoot === shoot.id
            })

            if (!shootUpdates.length) {
              return baseItems.length === shoot.items.length ? shoot : { ...shoot, items: baseItems }
            }

            const existingIds = new Set(baseItems.map(i => i.id))
            const updatedItems = baseItems.map(item => {
              const found = shootUpdates.find(u => u.item.id === item.id)
              return found ? { ...item, ...found.item } : item
            })
            const newItems = shootUpdates
              .filter(u => !existingIds.has(u.item.id))
              .map(u => u.item)
            return { ...shoot, items: [...updatedItems, ...newItems] }
          }),
        }
      }),

      mergeShoots: (updates, newShootsWithItems) => set(s => {
        const existingIds = new Set(s.savedShoots.map(sh => sh.id))
        const updatedShoots = s.savedShoots.map(shoot => {
          const found = updates.find(u => u.id === shoot.id)
          if (!found) return shoot
          return { ...found, items: shoot.items } // update metadata, preserve local items
        })
        return {
          savedShoots: [...updatedShoots, ...newShootsWithItems.filter(sh => !existingIds.has(sh.id))],
        }
      }),
    }),
    {
      name: 'stockshot-v2',
      partialize: (s) => ({
        activeShootId: s.activeShootId,
        orgId: s.orgId,
        markShotOnScanIn: s.markShotOnScanIn,
        currentIntakeLook: s.currentIntakeLook,
        scanInLocation: s.scanInLocation,
        scanOutLocation: s.scanOutLocation,
        stylingMode: s.stylingMode,
        lastPulledAt: s.lastPulledAt,
        lastSyncedAt: s.lastSyncedAt,
      }),
    }
  )
)

export default useAppStore
