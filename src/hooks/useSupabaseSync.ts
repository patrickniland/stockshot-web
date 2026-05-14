// StockShot — Supabase Sync Hook
// Architecture:
//   - On load: fetch all shoots + items from Supabase
//   - Scans/changes: store actions write directly to Supabase (fire and forget)
//   - Real-time: Supabase notifies when stock_items or shoots change on other devices
//   - No polling, no auto-save loops, no conflicts

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchShoots,
  fetchItemsForShoot,
  fetchClients,
  upsertShootMeta,
  upsertClient,
  deleteShoot,
  deleteClientFromDB,
} from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)

  // ── Load all data on startup ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || loadedRef.current) return

    async function loadAll() {
      try {
        const [shootMetas, clients] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])

        // Fetch items for each shoot in parallel
        const shoots = await Promise.all(
          shootMetas.map(async meta => ({
            ...meta,
            items: await fetchItemsForShoot(meta.id),
          }))
        )

        setShoots(shoots)
        setClients(clients)

        // Set active shoot if none set or current one doesn't exist
        const activeShoots = shoots.filter(s => !s.deletedAt)
        if (activeShoots.length > 0) {
          const currentExists = activeShoots.some(s => s.id === activeShootId)
          if (!activeShootId || !currentExists) {
            setActiveShootId(activeShoots[0].id)
          }
        }

        loadedRef.current = true
        setLoaded(true)
      } catch (e) {
        console.error('[Sync] Initial load failed:', e)
        setLoaded(true) // Still mark loaded so UI shows
      }
    }

    loadAll()
  }, [orgId])

  // ── Save shoot metadata changes to Supabase ───────────────────────────────
  // Fires when shoot names, drops, lookOrder, deletedAt change
  // Does NOT fire on item changes (those save directly from store actions)
  const savedShoots = useAppStore(s => s.savedShoots)
  const deletedShootIds = useAppStore(s => s.deletedShootIds)
  const clients = useAppStore(s => s.clients)
  const deletedClientIds = useAppStore(s => s.deletedClientIds)

  // Track previous values to detect real changes
  const prevShootMetaRef = useRef<string>('')
  const prevClientsRef = useRef<string>('')

  useEffect(() => {
    if (!orgId || !loadedRef.current) return

    // Create a fingerprint of shoot metadata only (not items)
    const metaFingerprint = savedShoots.map(s =>
      `${s.id}:${s.name}:${s.updatedAt}:${s.deletedAt}:${s.drops.length}:${s.lookOrder.join(',')}`
    ).join('|')

    if (metaFingerprint === prevShootMetaRef.current) return
    prevShootMetaRef.current = metaFingerprint

    async function syncShootMeta() {
      try {
        await Promise.all(savedShoots.map(s => upsertShootMeta(s, orgId!)))
        if (deletedShootIds?.length) {
          await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
        }
      } catch (e) {
        console.error('[Sync] Shoot meta save error:', e)
      }
    }

    syncShootMeta()
  }, [savedShoots, deletedShootIds, orgId])

  useEffect(() => {
    if (!orgId || !loadedRef.current) return

    const fingerprint = JSON.stringify(clients)
    if (fingerprint === prevClientsRef.current) return
    prevClientsRef.current = fingerprint

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
  }, [clients, deletedClientIds, orgId])

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !loaded) return

    // Listen for stock_items changes from OTHER devices
    // When an item changes, reload ONLY that shoot's items
    const itemsCh = supabase
      .channel(`items-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_items', filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const changed = payload.new as any
          if (!changed?.shoot_id || !changed?.id) return

          try {
            const currentShoots = useAppStore.getState().savedShoots
            const currentShoot = currentShoots.find(s => s.id === changed.shoot_id)
            const currentItem = currentShoot?.items.find(i => i.id === changed.id)

            // Last-write-wins: only apply if incoming is newer than local
            // updated_at comes from Supabase server clock — reliable arbiter
            if (currentItem && changed.updated_at && currentItem.updatedAt) {
              if (changed.updated_at <= currentItem.updatedAt) {
                return // Local version is newer — ignore incoming
              }
            }

            const items = await fetchItemsForShoot(changed.shoot_id)
            setShoots(
              currentShoots.map(s =>
                s.id === changed.shoot_id ? { ...s, items } : s
              )
            )
          } catch (e) {
            console.error('[Realtime] Item update error:', e)
          }
        }
      )
      .subscribe()

    // Listen for shoot metadata changes from OTHER devices
    const shootsCh = supabase
      .channel(`shoots-${orgId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shoots', filter: `org_id=eq.${orgId}` },
        async () => {
          try {
            const metas = await fetchShoots(orgId!)
            const current = useAppStore.getState().savedShoots
            // Merge: update metadata but keep existing items in memory
            setShoots(
              metas.map(meta => ({
                ...meta,
                items: current.find(s => s.id === meta.id)?.items ?? [],
              }))
            )
          } catch (e) {
            console.error('[Realtime] Shoot meta update error:', e)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(itemsCh)
      supabase.removeChannel(shootsCh)
    }
  }, [orgId, loaded])
}
