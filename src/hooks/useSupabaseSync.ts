// StockShot — Supabase Sync Hook
// STABLE VERSION: Manual save only, no automatic save loops

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchShoots, fetchClients, upsertShootMeta, upsertItems, upsertClient, deleteShoot, deleteClientFromDB, fetchItemsForShoot } from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const isReceiving = useRef(false)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)

  // ── Initial load only ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return
    async function loadData() {
      isReceiving.current = true
      try {
        const [shootMetas, cls] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])
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
        console.error('[Sync] Load failed:', e)
      } finally {
        isReceiving.current = false
        setLoaded(true)
      }
    }
    loadData()
  }, [orgId])

  // ── Real-time: listen for item changes from other devices ─────────────────
  useEffect(() => {
    if (!orgId || !loaded) return

    const itemsCh = supabase
      .channel(`items-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'stock_items',
        filter: `org_id=eq.${orgId}`,
      }, async (payload) => {
        if (isReceiving.current) return
        const changed = payload.new as any
        if (!changed?.shoot_id) return
        isReceiving.current = true
        try {
          const items = await fetchItemsForShoot(changed.shoot_id)
          setShoots(
            useAppStore.getState().savedShoots.map(s =>
              s.id === changed.shoot_id ? { ...s, items } : s
            )
          )
        } catch (e) {
          console.error('[Realtime] Error:', e)
        } finally {
          setTimeout(() => { isReceiving.current = false }, 300)
        }
      })
      .subscribe()

    const shootsCh = supabase
      .channel(`shoots-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shoots',
        filter: `org_id=eq.${orgId}`,
      }, async () => {
        if (isReceiving.current) return
        isReceiving.current = true
        try {
          const metas = await fetchShoots(orgId!)
          const current = useAppStore.getState().savedShoots
          setShoots(metas.map(m => ({
            ...m,
            items: current.find(s => s.id === m.id)?.items ?? []
          })))
        } catch (e) {
          console.error('[Realtime] Shoots error:', e)
        } finally {
          setTimeout(() => { isReceiving.current = false }, 300)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(itemsCh)
      supabase.removeChannel(shootsCh)
    }
  }, [orgId, loaded])
}
