// StockShot — Global App State
// Complete Zustand store — forward planned for all phases

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Client, Shoot, StockItem, Drop,
  ScanFeedback, FeedbackType,
  ItemStatus, ShotStatus,
} from '../types'
import { updateItemStatus, upsertItems, deleteItemsByShoot } from '../lib/db'

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
  softDeleteShoot: (shoot: Shoot) => void
  restoreShoot: (shoot: Shoot) => void
  permanentlyDeleteShoot: (shoot: Shoot) => void
  getTrashedShoots: () => Shoot[]
  getActiveShoots: () => Shoot[]
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
  setShoots: (shoots: Shoot[]) => void
  setClients: (clients: Client[]) => void
  setActiveShootId: (id: string) => void
  setOrgId: (id: string) => void
  setMarkShotOnScanIn: (val: boolean) => void
  setCurrentIntakeLook: (val: number) => void
  setLastScanFeedback: (val: ScanFeedback | null) => void
}

// Normalise a scanned barcode value before matching
// Handles two retail barcode formats:
// Format 1 — with dashes e.g. "98-61332537-5" → returns middle part "61332537"
// Format 2 — no dashes e.g. "98613325375" → drops first 2 and last 1 digit → "61332537"
// Anything else passes through unchanged
function normaliseScan(raw: string): string {
  const trimmed = raw.trim()

  // Format 1: dashes e.g. "98-61332537-5"
  const parts = trimmed.split('-')
  if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
    return parts[1]
  }

  // Format 2: all digits, 4+ chars — strip first 2 and last 1
  if (/^\d+$/.test(trimmed) && trimmed.length >= 4) {
    return trimmed.slice(2, -1)
  }

  // Pass through unchanged
  return trimmed
}

// Find an item by matching normalised scan value against multiple fields
// Order: sku → qrCodeValue → styleNumber → extraFields
function findItem(items: StockItem[], query: string): StockItem | undefined {
  const raw = query.trim()
  const normalised = normaliseScan(raw).toLowerCase()
  const rawLower = raw.toLowerCase()

  // Try both raw and normalised against each field
  return items.find(i => {
    const sku = i.sku.toLowerCase()
    const qr = i.qrCodeValue.toLowerCase()
    const style = i.styleNumber.toLowerCase()
    const extraValues = Object.values(i.extraFields).map(v => v.toLowerCase())

    return (
      sku === rawLower || sku === normalised ||
      qr === rawLower || qr === normalised ||
      style === rawLower || style === normalised ||
      extraValues.some(v => v === rawLower || v === normalised)
    )
  })
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
      orgId: null,
      deletedShootIds: [],
      deletedClientIds: [],
      lastScanFeedback: null,
      currentIntakeLook: 0,  // 0 = no look assigned
      markShotOnScanIn: false,

      // ── Derived ─────────────────────────────────────────
      getTrashedShoots: () => {
        const { savedShoots } = get()
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        return savedShoots.filter(s => s.deletedAt !== null && s.deletedAt !== undefined && s.deletedAt > thirtyDaysAgo)
      },

      getActiveShoots: () => {
        const { savedShoots } = get()
        return savedShoots.filter(s => !s.deletedAt)
      },

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
        clients: s.clients.filter(c => c.id !== clientId),
        deletedClientIds: [...s.deletedClientIds, clientId],
      })),

      // ── Shoot actions ────────────────────────────────────
      addShoot: (shoot) => set(s => ({
        savedShoots: [...s.savedShoots, { ...shoot, deletedAt: null }],
        activeShootId: shoot.id,
      })),

      switchToShoot: (shoot) => set({ activeShootId: shoot.id, currentIntakeLook: 1 }),

      softDeleteShoot: (shoot) => set(s => {
        const updated = s.savedShoots.map(sh =>
          sh.id === shoot.id ? { ...sh, deletedAt: new Date().toISOString() } : sh
        )
        const remaining = updated.filter(sh => !sh.deletedAt)
        return {
          savedShoots: updated,
          activeShootId: s.activeShootId === shoot.id
            ? (remaining.length > 0 ? remaining[0].id : null)
            : s.activeShootId,
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
            ? (remaining.filter(sh => !sh.deletedAt).length > 0 ? remaining.filter(sh => !sh.deletedAt)[0].id : null)
            : s.activeShootId,
          deletedShootIds: [...s.deletedShootIds, shoot.id],
        }
      }),

      deleteShoot: (shoot) => set(s => {
        const remaining = s.savedShoots.filter(x => x.id !== shoot.id)
        return {
          savedShoots: remaining,
          activeShootId: remaining.length > 0 ? remaining[0].id : null,
          deletedShootIds: [...s.deletedShootIds, shoot.id],
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

      clearActiveShoot: () => {
        const { activeShootId, orgId } = get()
        set(s => ({
          savedShoots: s.savedShoots.map(sh =>
            sh.id === s.activeShootId
              ? { ...sh, items: [], drops: [], updatedAt: new Date().toISOString() }
              : sh
          ),
        }))
        if (activeShootId && orgId) {
          deleteItemsByShoot(activeShootId).catch(e => console.error('[Sync] clear items error:', e))
        }
      },

      bumpLook: () => set(s => {
        const newLook = s.currentIntakeLook + 1
        // Also add the new look number to the active shoot's lookOrder
        const savedShoots = s.savedShoots.map(sh => {
          if (sh.id !== s.activeShootId) return sh
          const lookOrder = sh.lookOrder.includes(newLook)
            ? sh.lookOrder
            : [...sh.lookOrder, newLook].sort((a, b) => a - b)
          return { ...sh, lookOrder, updatedAt: new Date().toISOString() }
        })
        return { currentIntakeLook: newLook, savedShoots }
      }),

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
          // Only assign look if a specific look is active (look > 0)
          const looks = currentIntakeLook > 0
            ? (i.looks.includes(currentIntakeLook) ? i.looks : [...i.looks, currentIntakeLook])
            : i.looks
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

        // Immediately sync dispatched item to Supabase
        const updatedItem = updated.find(i => i.id === item.id)
        const orgId = get().orgId
        if (updatedItem && orgId) {
          updateItemStatus(updatedItem.id, {
            status: updatedItem.status,
            dispatchedAt: updatedItem.dispatchedAt,
            dispatchedTo: updatedItem.dispatchedTo,
          }).catch(e => console.error('[Sync] scanOut item sync error:', e))
        }
      },

      // ── Settings ─────────────────────────────────────────
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
      partialize: (s) => ({
        clients: s.clients,
        savedShoots: s.savedShoots,
        activeShootId: s.activeShootId,
        markShotOnScanIn: s.markShotOnScanIn,
        orgId: s.orgId,
      }),
    }
  )
)

export default useAppStore
