// StockShot — Global App State
// Scans and changes update LOCAL state only.
// Use Push/Pull buttons to sync with Supabase.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Client, Shoot, StockItem, Drop,
  ScanFeedback, FeedbackType,
  ShotStatus, CustodyLocation, CustodyEvent,
} from '../types'
import { updateItemStatus, updateItemCustody, upsertItem } from '../lib/db'

interface AppStore {
  clients: Client[]
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
  managerPin: string

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

  // Legacy selectors — kept during transition, removed in Phase 6
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

  // Custody actions
  setCustody: (itemId: string, location: CustodyLocation, operator: string, shootId?: string, notes?: string) => void
  bulkSetCustody: (itemIds: string[], location: CustodyLocation, operator: string) => void
  moveItemsToShoot: (itemIds: string[], targetShootId: string) => void
  addItemToShoot: (item: StockItem, shootId: string) => void
  restoreItemState: (itemId: string, updates: Partial<StockItem>) => void

  // Legacy scan actions — kept during transition, replaced in Phase 3/4
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
  setManagerPin: (val: string) => void
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
      managerPin: '',

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

      // Legacy selectors
      getPending: () => get().getItems().filter(i => i.custodyLocation === 'at_client'),
      getReceived: () => get().getItems().filter(i => i.custodyLocation === 'at_studio'),
      getDispatched: () => get().getItems().filter(i => i.custodyLocation === 'at_client'),
      pendingIsMeaningful: () =>
        get().getActiveShoot()?.drops.some(d => d.importMode === 'jobList') ?? false,

      // ── Clients ───────────────────────────────────────────
      addClient: (client) => set(s => ({ clients: [...s.clients, client] })),
      updateClient: (client) => set(s => {
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
      }),
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

      softDeleteShoot: (shoot) => set(s => {
        const updated = s.savedShoots.map(sh =>
          sh.id === shoot.id ? { ...sh, deletedAt: new Date().toISOString() } : sh
        )
        const remaining = updated.filter(sh => !sh.deletedAt)
        return {
          savedShoots: updated,
          activeShootId: s.activeShootId === shoot.id ? (remaining[0]?.id ?? null) : s.activeShootId,
        }
      }),

      restoreShoot: (shoot) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === shoot.id ? { ...sh, deletedAt: null } : sh
        ),
      })),

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

      renameActiveShoot: (name) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, name, updatedAt: new Date().toISOString() } : sh
        ),
      })),

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

      bumpLook: () => set(s => {
        const newLook = s.currentIntakeLook + 1
        const savedShoots = s.savedShoots.map(sh => {
          if (sh.id !== s.activeShootId) return sh
          const lookOrder = sh.lookOrder.includes(newLook)
            ? sh.lookOrder
            : [...sh.lookOrder, newLook].sort((a, b) => a - b)
          return { ...sh, lookOrder, updatedAt: new Date().toISOString() }
        })
        return { currentIntakeLook: newLook, savedShoots }
      }),

      reorderLook: (lookA, lookB) => set(s => {
        const sh = s.savedShoots.find(x => x.id === s.activeShootId)
        if (!sh) return s
        const swap = (n: number) => n === lookA ? lookB : n === lookB ? lookA : n
        const items = sh.items.map(item => ({
          ...item,
          looks: item.looks.map(swap).sort((a, b) => a - b),
        }))
        const lookOrder = sh.lookOrder.map(swap).sort((a, b) => a - b)
        return {
          savedShoots: s.savedShoots.map(x =>
            x.id === s.activeShootId ? { ...x, items, lookOrder, updatedAt: new Date().toISOString() } : x
          ),
        }
      }),

      // ── Item actions ──────────────────────────────────────
      updateItem: (itemId, updates) => {
        const items = get().getItems().map(i => i.id === itemId ? { ...i, ...updates } : i)
        get().updateShootItems(items)
      },

      assignProductType: (itemId, productType) => {
        const shoot = get().getActiveShoot()
        const client = get().getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        get().updateShootItems(
          get().getItems().map(i => i.id === itemId ? { ...i, productType, requiredAngles } : i)
        )
      },

      toggleAngle: (itemId, angle) => {
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
      },

      bulkAssignProductType: (itemIds, productType) => {
        const shoot = get().getActiveShoot()
        const client = get().getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        get().updateShootItems(
          get().getItems().map(i =>
            itemIds.includes(i.id) ? { ...i, productType, requiredAngles } : i
          )
        )
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

        updateItemCustody(itemId, {
          custodyLocation: location,
          custodyHistory: updatedItem.custodyHistory,
          lastScannedAt: now,
          lastScannedBy: operator,
        }).catch(e => console.error('[Sync] setCustody error:', e))
      },

      bulkSetCustody: (itemIds, location, operator) => {
        itemIds.forEach(id => get().setCustody(id, location, operator))
      },

      moveItemsToShoot: (itemIds, targetShootId) => {
        const { savedShoots, orgId } = get()
        if (!orgId) return

        const movedItems: StockItem[] = []

        // Remove items from their current shoots
        const withItemsRemoved = savedShoots.map(shoot => {
          const toMove = shoot.items.filter(i => itemIds.includes(i.id))
          if (toMove.length === 0) return shoot
          movedItems.push(...toMove.map(i => ({ ...i, looks: [] })))
          return { ...shoot, items: shoot.items.filter(i => !itemIds.includes(i.id)) }
        })

        // Add items to target shoot
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
            lastScannedAt: updates.lastScannedAt ?? '',
            lastScannedBy: updates.lastScannedBy ?? '',
          }).catch(e => console.error('[Sync] restoreItemState error:', e))
        }
      },

      // ── Legacy scan actions (transition only) ─────────────
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
      setMarkShotOnScanIn: (val) => set({ markShotOnScanIn: val }),
      setCurrentIntakeLook: (val) => set({ currentIntakeLook: val }),
      setLastScanFeedback: (val) => set({ lastScanFeedback: val }),
      setManagerPin: (val) => set({ managerPin: val }),
      setScanInLocation: (val) => set({ scanInLocation: val }),
      setScanOutLocation: (val) => set({ scanOutLocation: val }),
      setCurrentOperator: (val) => set({ currentOperator: val }),
      setShotListLocationFilter: (val) => set({ shotListLocationFilter: val }),
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
        currentOperator: s.currentOperator,
        managerPin: s.managerPin,
      }),
    }
  )
)

export default useAppStore
