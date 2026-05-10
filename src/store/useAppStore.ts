// StockShot — Global App State
// Complete Zustand store — forward planned for all phases

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Client, Shoot, StockItem, Drop,
  ScanFeedback, FeedbackType,
  ItemStatus, ShotStatus,
} from '../types'

interface AppStore {
  // ── Data ────────────────────────────────────────────────
  clients: Client[]
  savedShoots: Shoot[]
  activeShootId: string | null
  lastScanFeedback: ScanFeedback | null
  currentIntakeLook: number
  markShotOnScanIn: boolean

  // ── Derived ─────────────────────────────────────────────
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

  // ── Client actions ───────────────────────────────────────
  addClient: (client: Client) => void
  updateClient: (client: Client) => void
  deleteClient: (clientId: string) => void

  // ── Shoot actions ────────────────────────────────────────
  addShoot: (shoot: Shoot) => void
  switchToShoot: (shoot: Shoot) => void
  deleteShoot: (shoot: Shoot) => void
  renameActiveShoot: (name: string) => void
  updateShootItems: (items: StockItem[]) => void
  addDropToActiveShoot: (drop: Drop, items: StockItem[]) => void
  clearActiveShoot: () => void
  bumpLook: () => void

  // ── Item actions ─────────────────────────────────────────
  updateItem: (itemId: string, updates: Partial<StockItem>) => void
  assignProductType: (itemId: string, productType: string) => void
  toggleAngle: (itemId: string, angle: string) => void
  bulkAssignProductType: (itemIds: string[], productType: string) => void

  // ── Scan actions ─────────────────────────────────────────
  scanIn: (sku: string) => void
  scanOut: (sku: string, to: string) => void

  // ── Settings ─────────────────────────────────────────────
  setMarkShotOnScanIn: (val: boolean) => void
  setCurrentIntakeLook: (val: number) => void
  setLastScanFeedback: (val: ScanFeedback | null) => void
}

// Helper to find an item by SKU / style number / QR value
function findItem(items: StockItem[], query: string): StockItem | undefined {
  const q = query.trim().toLowerCase()
  return items.find(i =>
    i.sku.toLowerCase() === q ||
    i.styleNumber.toLowerCase() === q ||
    i.qrCodeValue.toLowerCase() === q
  )
}

function feedback(type: FeedbackType, message: string, scannedValue: string): ScanFeedback {
  return { id: Date.now().toString(), type, message, scannedValue }
}

const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      clients: [],
      savedShoots: [],
      activeShootId: null,
      lastScanFeedback: null,
      currentIntakeLook: 1,
      markShotOnScanIn: false,

      // ── Derived ─────────────────────────────────────────
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

      pendingIsMeaningful: () => {
        const shoot = get().getActiveShoot()
        return shoot?.drops.some(d => d.importMode === 'jobList') ?? false
      },

      clientName: (clientId) => {
        if (!clientId) return null
        return get().clients.find(c => c.id === clientId)?.name ?? null
      },

      getClient: (clientId) => {
        if (!clientId) return null
        return get().clients.find(c => c.id === clientId) ?? null
      },

      // ── Client actions ───────────────────────────────────
      addClient: (client) => set(s => ({ clients: [...s.clients, client] })),

      updateClient: (client) => set(s => ({
        clients: s.clients.map(c => c.id === client.id ? client : c)
      })),

      deleteClient: (clientId) => set(s => ({
        clients: s.clients.filter(c => c.id !== clientId)
      })),

      // ── Shoot actions ────────────────────────────────────
      addShoot: (shoot) => set(s => ({
        savedShoots: [...s.savedShoots, shoot],
        activeShootId: shoot.id,
      })),

      switchToShoot: (shoot) => set({ activeShootId: shoot.id, currentIntakeLook: 1 }),

      deleteShoot: (shoot) => set(s => {
        const remaining = s.savedShoots.filter(x => x.id !== shoot.id)
        return {
          savedShoots: remaining,
          activeShootId: remaining.length > 0 ? remaining[0].id : null,
        }
      }),

      renameActiveShoot: (name) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, name, updatedAt: new Date().toISOString() }
            : sh
        ),
      })),

      updateShootItems: (items) => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, items, updatedAt: new Date().toISOString() }
            : sh
        ),
      })),

      addDropToActiveShoot: (drop, items) => set(s => ({
        savedShoots: s.savedShoots.map(sh => {
          if (sh.id !== s.activeShootId) return sh
          const merged = [...sh.items, ...items]
          return {
            ...sh,
            items: merged,
            drops: [...sh.drops, drop],
            updatedAt: new Date().toISOString(),
          }
        }),
      })),

      clearActiveShoot: () => set(s => ({
        savedShoots: s.savedShoots.map(sh =>
          sh.id === s.activeShootId
            ? { ...sh, items: [], drops: [], updatedAt: new Date().toISOString() }
            : sh
        ),
      })),

      bumpLook: () => set(s => ({ currentIntakeLook: s.currentIntakeLook + 1 })),

      // ── Item actions ─────────────────────────────────────
      updateItem: (itemId, updates) => {
        const items = get().getItems().map(i => i.id === itemId ? { ...i, ...updates } : i)
        get().updateShootItems(items)
      },

      assignProductType: (itemId, productType) => {
        const { getItems, updateShootItems, getActiveShoot, getClient } = get()
        const shoot = getActiveShoot()
        const client = getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        const items = getItems().map(i =>
          i.id === itemId ? { ...i, productType, requiredAngles } : i
        )
        updateShootItems(items)
      },

      toggleAngle: (itemId, angle) => {
        const items = get().getItems().map(i => {
          if (i.id !== itemId) return i
          const completed = i.completedAngles.includes(angle)
            ? i.completedAngles.filter(a => a !== angle)
            : [...i.completedAngles, angle]
          const allDone = i.requiredAngles.length > 0 &&
            i.requiredAngles.every(a => completed.includes(a))
          return {
            ...i,
            completedAngles: completed,
            shotStatus: allDone ? 'shot' as ShotStatus : i.shotStatus,
            shotAt: allDone ? new Date().toISOString() : i.shotAt,
          }
        })
        get().updateShootItems(items)
      },

      bulkAssignProductType: (itemIds, productType) => {
        const { getItems, updateShootItems, getActiveShoot, getClient } = get()
        const shoot = getActiveShoot()
        const client = getClient(shoot?.clientId ?? null)
        const pt = client?.productTypes.find(p => p.name === productType)
        const requiredAngles = pt?.requiredAngles.map(a => a.name) ?? []
        const items = getItems().map(i =>
          itemIds.includes(i.id) ? { ...i, productType, requiredAngles } : i
        )
        updateShootItems(items)
      },

      // ── Scan In ──────────────────────────────────────────
      scanIn: (sku) => {
        const { getItems, updateShootItems, markShotOnScanIn, currentIntakeLook } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) {
          set({ lastScanFeedback: feedback('notFound', 'Item not found', sku) })
          return
        }
        if (item.status === 'received') {
          set({ lastScanFeedback: feedback('alreadyReceived', 'Already scanned in', sku) })
          return
        }
        if (item.status === 'dispatched') {
          set({ lastScanFeedback: feedback('alreadyDispatched', 'Already dispatched', sku) })
          return
        }

        const now = new Date().toISOString()
        const updated = items.map(i => {
          if (i.id !== item.id) return i
          const looks = i.looks.includes(currentIntakeLook)
            ? i.looks : [...i.looks, currentIntakeLook]
          return {
            ...i,
            status: 'received' as ItemStatus,
            receivedAt: now,
            looks,
            shotStatus: markShotOnScanIn ? 'shot' as ShotStatus : i.shotStatus,
            shotAt: markShotOnScanIn ? now : i.shotAt,
            completedAngles: markShotOnScanIn ? i.requiredAngles : i.completedAngles,
          }
        })

        updateShootItems(updated)
        set({
          lastScanFeedback: feedback(
            'success',
            markShotOnScanIn ? 'Received + Shot' : 'Received',
            sku
          )
        })
      },

      // ── Scan Out ─────────────────────────────────────────
      scanOut: (sku, to) => {
        const { getItems, updateShootItems } = get()
        const items = getItems()
        const item = findItem(items, sku)

        if (!item) {
          set({ lastScanFeedback: feedback('notFound', 'Item not found', sku) })
          return
        }
        if (item.status === 'dispatched') {
          set({ lastScanFeedback: feedback('alreadyDispatched', 'Already dispatched', sku) })
          return
        }
        if (item.status === 'pending') {
          set({ lastScanFeedback: feedback('notYetReceived', 'Not yet received — scan in first', sku) })
          return
        }

        const updated = items.map(i => i.id === item.id ? {
          ...i,
          status: 'dispatched' as ItemStatus,
          dispatchedAt: new Date().toISOString(),
          dispatchedTo: to,
        } : i)

        updateShootItems(updated)
        set({ lastScanFeedback: feedback('success', `Dispatched to ${to}`, sku) })
      },

      // ── Settings ─────────────────────────────────────────
      setMarkShotOnScanIn: (val) => set({ markShotOnScanIn: val }),
      setCurrentIntakeLook: (val) => set({ currentIntakeLook: val }),
      setLastScanFeedback: (val) => set({ lastScanFeedback: val }),
    }),
    {
      name: 'stockshot-v1',
      partialize: (s) => ({
        clients: s.clients,
        savedShoots: s.savedShoots,
        activeShootId: s.activeShootId,
        markShotOnScanIn: s.markShotOnScanIn,
      }),
    }
  )
)

export default useAppStore
