// StockShot — Supabase Real-time Sync Hook

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchShoots, fetchClients, upsertShoot, upsertClient, deleteShoot, deleteClientFromDB } from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const savedShoots = useAppStore(s => s.savedShoots)
  const clients = useAppStore(s => s.clients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)
  const deletedShootIds = useAppStore(s => s.deletedShootIds)
  const deletedClientIds = useAppStore(s => s.deletedClientIds)

  // Initial load
  useEffect(() => {
    if (!orgId) return
    async function loadData() {
      try {
        const [shoots, cls] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])
        setShoots(shoots)
        setClients(cls)
        if (!activeShootId && shoots.length > 0) {
          setActiveShootId(shoots[0].id)
        }
      } catch (e) {
        console.error('Failed to load from Supabase:', e)
      } finally {
        setLoaded(true)
      }
    }
    loadData()
  }, [orgId])

  // Sync shoots to Supabase when they change
  // Only runs after initial load is complete
  useEffect(() => {
    if (!orgId || !loaded) return
    if (syncTimeout.current) clearTimeout(syncTimeout.current)

    syncTimeout.current = setTimeout(async () => {
      try {
        console.log('[Sync] Saving', savedShoots.length, 'shoots to Supabase...')
        await Promise.all(savedShoots.map(s => upsertShoot(s, orgId!)))
        console.log('[Sync] Shoots saved ✓')
        if (deletedShootIds?.length) {
          await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
        }
      } catch (e) {
        console.error('[Sync] Shoot sync error:', e)
      }
    }, 1000)

    return () => { if (syncTimeout.current) clearTimeout(syncTimeout.current) }
  }, [savedShoots, deletedShootIds, orgId, loaded])

  // Sync clients
  useEffect(() => {
    if (!orgId || !loaded) return
    async function syncClients() {
      try {
        await Promise.all(clients.map(c => upsertClient(c, orgId!)))
        if (deletedClientIds?.length) {
          await Promise.all(deletedClientIds.map(id => deleteClientFromDB(id)))
        }
      } catch (e) {
        console.error('[Sync] Client sync error:', e)
      }
    }
    syncClients()
  }, [clients, deletedClientIds, orgId, loaded])

  // Real-time subscriptions
  useEffect(() => {
    if (!orgId) return

    const deviceId = Math.random().toString(36).slice(2, 8)
    const shootsCh = supabase
      .channel(`shoots-${orgId}-${deviceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shoots',
        filter: `org_id=eq.${orgId}`,
      }, async () => {
        try {
          console.log('[Realtime] Shoots changed — reloading...')
          const shoots = await fetchShoots(orgId!)
          setShoots(shoots)
        } catch (e) {
          console.error('[Realtime] Error:', e)
        }
      })
      .subscribe((status) => {
        console.log('[Realtime] Shoots channel status:', status)
      })

    const clientsCh = supabase
      .channel(`clients-${orgId}-${deviceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clients',
        filter: `org_id=eq.${orgId}`,
      }, async () => {
        try {
          setClients(await fetchClients(orgId!))
        } catch (e) {
          console.error('[Realtime] Clients error:', e)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(shootsCh)
      supabase.removeChannel(clientsCh)
    }
  }, [orgId])
}
