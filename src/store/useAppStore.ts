// StockShot — Global App State
// Source of truth: Supabase. localStorage only persists session/prefs.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Client, Shoot, StockItem, Drop,
  ScanFeedback, FeedbackType,
  ItemStatus, ShotStatus,
} from '../types'
import { updateItemStatus, deleteItemsByShoot, upsertShootMeta } from '../lib/db'

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

  getActiveShoot: () => Shoot | null
  getItems: () => StockItem[]
  getPending: () => StockItem[]
  getReceived: () => StockItem[]
  getDispatched: () => StockItem[]
  getShot: () => StockItem[]
  getNotShot: () => StockItem[]
  pendingIsMeaningful: () => boolean
  clientName: (clientId: string | null) => string | null
  getClient: (clientId: string | null) => Client | null
  getActiveShoots: () => Shoot[]
  getTrashedShoots: () => Shoot[]

  addClient: (client: Client) => void
  updateClient: (client: Client) => void
  deleteClient: (clientId: string) => void

  addShoot: (shoot: Shoot) => void
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

  updateItem: (itemId: string, updates: Partial<StockItem>) => void
  assignProductType: (itemId: string, productType: string) => void
  toggleAngle: (itemId: string, angle: string) => void
  bulkAssignProductType: (itemIds: string[], productType: string) => void

  scanIn: (sku: string) => void
  scanOut: (sku: string, to: string) => void

  setShoots: (shoots: Shoot[]) => void
  setClients: (clients: Client[]) => void
  setActiveShootId: (id: string) => void
  setOrgId: (id: string) => void
  setMarkShotOnScanIn: (val: boolean) => void
  setCurrentIntakeLook: (val: number) => void
  setLastScanFeedback: (val: ScanFeedback | null) => void
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

      // ── Derived ───────────────────────────────────────────
      getActiveShoot: () => {
        const { savedShoots, activeShootId } = get()
        return savedShoots.find(s => s.id === activeShootId) ?? null
      },
      getItems: () => get().getActiveShoot()?.items ?? [],
      getPending: () => get().getItems().filter(i => i.status === 'pending'),
      getReceived: () => get().getItems().filter(i => i.status === 'received'),
      getDispatched: () => get().getItems().filter(i => i.status === 'dispatched'),
      getShot: () => get().getItems().filter(i => i.shotStatus === 'shot'),
      getNotShot: () => get().getItems().filter(i => i.shotStatus === 'notShot'),
      pendingIsMeaningful: () =>
        get().getActiveShoot()?.drops.some(d => d.importMode === 'jobList') ?? false,
      clientName: (id) => id ? (get().clients.find(c => c.id === id)?.name ?? null) : null,
      getClient: (id) => id ? (get().clients.find(c => c.id === id) ?? null) : null,
      getActiveShoots: () => get().savedShoots.filter(s => !s.deletedAt),
      getTrashedShoots: () => {
        const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        return get().savedShoots.filter(s => s.deletedAt && s.deletedAt > ago)
      },

      // ── Clients ───────────────────────────────────────────
      addClient: (client) => set(s => ({ clients: [...s.clients, client] })),
      updateClient: (client) => set(s => ({
        clients: s.clients.map(c => c.id === client.id ? client : c)
      })),
      deleteClient: (clientId) => set(s => ({
        clients: s.clients.filter(c => c.id !== clientId),
        deletedClientIds: [...s.deletedClientIds, clientId],
      })),

      // ── Shoots ────────────────────────────────────────────
      addShoot: (shoot) => set(s => ({
        savedShoots: [...s.savedShoots, { ...shoot, deletedAt: null }],
        activeShootId: shoot.id,
      })),

      switchToShoot: (shoot) => set({ activeShootId: shoot.id, currentIntakeLook: 0 }),

      softDeleteShoot: (shoot) => {
        const orgId = get().orgId
        set(s => {
          const updated = s.savedShoots.map(sh =>
            sh.id === shoot.id ? { ...sh, deletedAt: new Date().toISOString() } : sh
          )
          const remaining = updated.filter(sh => !sh.deletedAt)
          return {
            savedShoots: updated,
            activeShootId: s.activeShootId === shoot.id
              ? (remaining[0]?.id ?? null) : s.activeShootId,
          }
        })
        // Sync to Supabase
        if (orgId) {
          const updatedShoot = { ...shoot, deletedAt: new Date().toISOString() }
          upsertShootMeta(updatedShoot, orgId).catch(e => console.error('[Sync] softDelete error:', e))
        }
      },

      restoreShoot: (shoot) => {
        const orgId = get().orgId
        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === shoot.id ? { ...sh, deletedAt: null } : sh
          ),
        }))
        if (orgId) {
          upsertShootMeta({ ...shoot, deletedAt: null }, orgId)
            .catch(e => console.error('[Sync] restore error:', e))
        }
      },

      permanentlyDeleteShoot: (shoot) => {
        const orgId = get().orgId
        set(s => {
          const remaining = s.savedShoots.filter(sh => sh.id !== shoot.id)
          return {
            savedShoots: remaining,
            activeShootId: s.activeShootId === shoot.id
              ? (remaining.filter(sh => !sh.deletedAt)[0]?.id ?? null) : s.activeShootId,
            deletedShootIds: [...s.deletedShootIds, shoot.id],
          }
        })
      },

      deleteShoot: (shoot) => set(s => {
        const remaining = s.savedShoots.filter(x => x.id !== shoot.id)
        return {
          savedShoots: remaining,
          activeShootId: remaining[0]?.id ?? null,
          deletedShootIds: [...s.deletedShootIds, shoot.id],
        }
      }),

      renameActiveShoot: (name) => {
        const orgId = get().orgId
        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === s.activeShootId
              ? { ...sh, name, updatedAt: new Date().toISOString() } : sh
          ),
        }))
        const shoot = get().getActiveShoot()
        if (shoot && orgId) {
          upsertShootMeta(shoot, orgId).catch(e => console.error('[Sync] rename error:', e))
        }
      },

      updateShootItems: (items) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, items, updatedAt: new Date().toISOString() } : sh
        ),
      })),

      addDropToActiveShoot: (drop, items) => {
        const orgId = get().orgId
        set(s => ({
          savedShoots: s.savedShoots.map(sh => {
            if (sh.id !== s.activeShootId) return sh
            return {
              ...sh,
              items: [...sh.items, ...items],
              drops: [...sh.drops, drop],
              updatedAt: new Date().toISOString(),
            }
          }),
        }))
        // Sync shoot metadata to Supabase
        const shoot = get().getActiveShoot()
        if (shoot && orgId) {
          upsertShootMeta(shoot, orgId).catch(e => console.error('[Sync] addDrop error:', e))
        }
      },

      clearActiveShoot: () => {
        const { activeShootId, orgId } = get()
        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === s.activeShootId
              ? { ...sh, items: [], drops: [], updatedAt: new Date().toISOString() } : sh
          ),
        }))
        if (activeShootId) {
          deleteItemsByShoot(activeShootId).catch(e => console.error('[Sync] clear error:', e))
        }
      },

      bumpLook: () => {
        const orgId = get().orgId
        set(s => {
          const newLook = s.currentIntakeLook + 1
          const savedShoots = s.savedShoots.map(sh => {
            if (sh.id !== s.activeShootId) return sh
            const lookOrder = sh.lookOrder.includes(newLook)
              ? sh.lookOrder
              : [...sh.lookOrder, newLook].sort((a, b) => a - b)
            return { ...sh, lookOrder, updatedAt: new Date().toISOString() }
          })
          return { currentIntakeLook: newLook, savedShoots }
        })
        const shoot = get().getActiveShoot()
        if (shoot && orgId) {
          upsertShootMeta(shoot, orgId).catch(e => console.error('[Sync] bumpLook error:', e))
        }
      },

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
        const items = get().getItems().map(i =>
          i.id === itemId ? { ...i, productType, requiredAngles } : i
        )
        get().updateShootItems(items)
        // Sync to Supabase
        updateItemStatus(itemId, { productType, requiredAngles })
          .catch(e => console.error('[Sync] assignProductType error:', e))
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
        const item = items.find(i => i.id === itemId)
        if (item) {
          updateItemStatus(itemId, {
            completedAngles: item.completedAngles,
            shotStatus: item.shotStatus,
            shotAt: item.shotAt,
          }).catch(e => console.error('[Sync] toggleAngle error:', e))
        }
      },

      bulkAssignProductType: (itemIds, productType) => {
        const shoot = get().getActiveShoot()
        const client = get().getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        const items = get().getItems().map(i =>
          itemIds.includes(i.id) ? { ...i, productType, requiredAngles } : i
        )
        get().updateShootItems(items)
        // Sync all affected items
        Promise.all(itemIds.map(id =>
          updateItemStatus(id, { productType, requiredAngles })
        )).catch(e => console.error('[Sync] bulkAssign error:', e))
      },

      // ── Scan In ───────────────────────────────────────────
      scanIn: (sku) => {
        const { getItems, updateShootItems, markShotOnScanIn, currentIntakeLook } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) { set({ lastScanFeedback: fb('notFound', 'Item not found', sku) }); return }
        if (item.status === 'received') { set({ lastScanFeedback: fb('alreadyReceived', 'Already scanned in', sku) }); return }
        if (item.status === 'dispatched') { set({ lastScanFeedback: fb('alreadyDispatched', 'Already dispatched', sku) }); return }

        const now = new Date().toISOString()
        const looks = currentIntakeLook > 0
          ? (item.looks.includes(currentIntakeLook) ? item.looks : [...item.looks, currentIntakeLook])
          : item.looks

        const updatedItem: StockItem = {
          ...item,
          status: 'received' as ItemStatus,
          receivedAt: now,
          looks,
          shotStatus: markShotOnScanIn ? 'shot' as ShotStatus : item.shotStatus,
          shotAt: markShotOnScanIn ? now : item.shotAt,
          completedAngles: markShotOnScanIn ? item.requiredAngles : item.completedAngles,
        }

        // Update local state
        updateShootItems(items.map(i => i.id === item.id ? updatedItem : i))
        set({ lastScanFeedback: fb('success', markShotOnScanIn ? 'Received + Shot' : 'Received', sku) })

        // Save to Supabase immediately
        updateItemStatus(item.id, {
          status: updatedItem.status,
          receivedAt: updatedItem.receivedAt,
          looks: updatedItem.looks,
          shotStatus: updatedItem.shotStatus,
          shotAt: updatedItem.shotAt,
          completedAngles: updatedItem.completedAngles,
        }).catch(e => console.error('[Sync] scanIn error:', e))
      },

      // ── Scan Out ──────────────────────────────────────────
      scanOut: (sku, to) => {
        const { getItems, updateShootItems } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) { set({ lastScanFeedback: fb('notFound', 'Item not found', sku) }); return }
        if (item.status === 'dispatched') { set({ lastScanFeedback: fb('alreadyDispatched', 'Already dispatched', sku) }); return }
        if (item.status === 'pending') { set({ lastScanFeedback: fb('notYetReceived', 'Not yet received — scan in first', sku) }); return }

        const updatedItem: StockItem = {
          ...item,
          status: 'dispatched' as ItemStatus,
          dispatchedAt: new Date().toISOString(),
          dispatchedTo: to,
        }

        updateShootItems(items.map(i => i.id === item.id ? updatedItem : i))
        set({ lastScanFeedback: fb('success', `Dispatched to ${to}`, sku) })

        // Save to Supabase immediately
        updateItemStatus(item.id, {
          status: updatedItem.status,
          dispatchedAt: updatedItem.dispatchedAt,
          dispatchedTo: updatedItem.dispatchedTo,
        }).catch(e => console.error('[Sync] scanOut error:', e))
      },

      // ── Settings ──────────────────────────────────────────
      setShoots: (shoots) => set({ savedShoots: shoots }),
      setClients: (clients) => set({ clients }),
      setActiveShootId: (id) => set({ activeShootId: id }),
      setOrgId: (id) => set({ orgId: id }),
      setMarkShotOnScanIn: (val) => set({ markShotOnScanIn: val }),
      setCurrentIntakeLook: (val) => set({ currentIntakeLook: val }),
      setLastScanFeedback: (val) => set({ lastScanFeedback: val }),
    }),
    {
      name: 'stockshot-v1',
      // Only persist session/prefs — NOT shoots or items
      // Supabase is the source of truth for data
      partialize: (s) => ({
        activeShootId: s.activeShootId,
        orgId: s.orgId,
        markShotOnScanIn: s.markShotOnScanIn,
        currentIntakeLook: s.currentIntakeLook,
      }),
    }
  )
)

export default useAppStore
