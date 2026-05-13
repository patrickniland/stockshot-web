// StockShot — Supabase Sync Hook
// Items stored as individual rows — real-time sync per item change

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchShoots, fetchItemsForShoot, fetchClients,
  upsertShootMeta, upsertItems, upsertClient,
  deleteShoot, deleteClientFromDB, updateItemStatus,
} from '../lib/db'
import useAppStore from '../store/useAppStore'
import { StockItem } from '../types'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const shootSyncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReceiving = useRef(false)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const savedShoots = useAppStore(s => s.savedShoots)
  const clients = useAppStore(s => s.clients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)
  const deletedShootIds = useAppStore(s => s.deletedShootIds)
  const deletedClientIds = useAppStore(s => s.deletedClientIds)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    async function loadData() {
      isReceiving.current = true
      try {
        // Load shoot metadata
        const [shootMetas, cls] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])

        // Load items for each shoot
        const shootsWithItems = await Promise.all(
          shootMetas.map(async (shoot) => {
            const items = await fetchItemsForShoot(shoot.id)
            return { ...shoot, items }
          })
        )

        setShoots(shootsWithItems)
        setClients(cls)
        if (!activeShootId && shootsWithItems.length > 0) {
          setActiveShootId(shootsWithItems[0].id)
        }
      } catch (e) {
        console.error('[Sync] Initial load failed:', e)
      } finally {
        isReceiving.current = false
        setLoaded(true)
      }
    }
    loadData()
  }, [orgId])

  // ── Sync shoot metadata when it changes ───────────────────────────────────
  useEffect(() => {
    if (!orgId || !loaded || isReceiving.current) return
    if (shootSyncTimeout.current) clearTimeout(shootSyncTimeout.current)

    shootSyncTimeout.current = setTimeout(async () => {
      if (isReceiving.current) return
      try {
        await Promise.all(
          savedShoots.map(s => upsertShootMeta(s, orgId!))
        )
        if (deletedShootIds?.length) {
          await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
        }
      } catch (e) {
        console.error('[Sync] Shoot meta save error:', e)
      }
    }, 1000)

    return () => { if (shootSyncTimeout.current) clearTimeout(shootSyncTimeout.current) }
  }, [savedShoots.map(s => `${s.id}-${s.name}-${s.updatedAt}-${s.deletedAt}`).join(','), deletedShootIds, orgId, loaded])

  // ── Sync clients ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !loaded || isReceiving.current) return
    async function syncClients() {
      try {
        await Promise.all(clients.map(c => upsertClient(c, orgId!)))
        if (deletedClientIds?.length) {
          await Promise.all(deletedClientIds.map(id => deleteClientFromDB(id)))
        }
      } catch (e) {
        console.error('[Sync] Client save error:', e)
      }
    }
    syncClients()
  }, [clients, deletedClientIds, orgId, loaded])

  // ── Real-time: listen for item changes from other devices ─────────────────
  useEffect(() => {
    if (!orgId || !loaded) return

    // Subscribe to stock_items changes for our org
    const itemsCh = supabase
      .channel(`items-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stock_items',
        filter: `org_id=eq.${orgId}`,
      }, async (payload) => {
        if (isReceiving.current) return

        // An item changed on another device — update just that item in our store
        const changed = payload.new as any
        if (!changed?.id || !changed?.shoot_id) return

        const shootId = changed.shoot_id
        isReceiving.current = true

        try {
          // Fetch updated items for just this shoot
          const items = await fetchItemsForShoot(shootId)

          // Update only this shoot's items in the store
          setShoots(
            useAppStore.getState().savedShoots.map(s =>
              s.id === shootId ? { ...s, items } : s
            )
          )
        } catch (e) {
          console.error('[Realtime] Item update error:', e)
        } finally {
          setTimeout(() => { isReceiving.current = false }, 200)
        }
      })
      .subscribe()

    // Subscribe to shoot metadata changes
    const shootsCh = supabase
      .channel(`shoots-meta-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shoots',
        filter: `org_id=eq.${orgId}`,
      }, async () => {
        if (isReceiving.current) return
        isReceiving.current = true
        try {
          const shootMetas = await fetchShoots(orgId!)
          const current = useAppStore.getState().savedShoots
          // Merge: keep existing items, update metadata
          const merged = shootMetas.map(meta => {
            const existing = current.find(s => s.id === meta.id)
            return { ...meta, items: existing?.items ?? [] }
          })
          setShoots(merged)
        } catch (e) {
          console.error('[Realtime] Shoot meta update error:', e)
        } finally {
          setTimeout(() => { isReceiving.current = false }, 200)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(itemsCh)
      supabase.removeChannel(shootsCh)
    }
  }, [orgId, loaded])
}

// ── Export helper for direct item saves from store actions ────────────────────
// Called by store when scanning in/out to immediately persist to Supabase
export async function syncItemToSupabase(
  item: StockItem,
  shootId: string,
  orgId: string
): Promise<void> {
  try {
    await updateItemStatus(item.id, {
      status: item.status,
      shotStatus: item.shotStatus,
      receivedAt: item.receivedAt,
      dispatchedAt: item.dispatchedAt,
      dispatchedTo: item.dispatchedTo,
      shotAt: item.shotAt,
      completedAngles: item.completedAngles,
      looks: item.looks,
    })
  } catch (e) {
    console.error('[Sync] Item sync error:', e)
  }
}
