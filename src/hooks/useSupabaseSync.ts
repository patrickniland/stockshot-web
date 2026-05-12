// StockShot — Supabase Real-time Sync Hook

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchShoots, fetchClients, upsertShoot, upsertClient, deleteShoot, deleteClientFromDB } from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const initialLoadDone = useRef(false)
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
    if (!orgId || initialLoadDone.current) return
    async function loadData() {
      try {
        const [shoots, cls] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])
        setShoots(shoots)
        setClients(cls)
        if (!activeShootId && shoots.length > 0) setActiveShootId(shoots[0].id)
        initialLoadDone.current = true
      } catch (e) {
        console.error('Failed to load from Supabase:', e)
      }
    }
    loadData()
  }, [orgId])

  // Sync shoots (debounced)
  useEffect(() => {
    if (!orgId || !initialLoadDone.current) return
    if (syncTimeout.current) clearTimeout(syncTimeout.current)
    syncTimeout.current = setTimeout(async () => {
      try {
        await Promise.all(savedShoots.map(s => upsertShoot(s, orgId!)))
        await Promise.all((deletedShootIds ?? []).map(id => deleteShoot(id)))
      } catch (e) { console.error('Shoot sync error:', e) }
    }, 1000)
    return () => { if (syncTimeout.current) clearTimeout(syncTimeout.current) }
  }, [savedShoots, deletedShootIds, orgId])

  // Sync clients
  useEffect(() => {
    if (!orgId || !initialLoadDone.current) return
    async function syncClients() {
      try {
        await Promise.all(clients.map(c => upsertClient(c, orgId!)))
        await Promise.all((deletedClientIds ?? []).map(id => deleteClientFromDB(id)))
      } catch (e) { console.error('Client sync error:', e) }
    }
    syncClients()
  }, [clients, deletedClientIds, orgId])

  // Real-time subscriptions
  useEffect(() => {
    if (!orgId) return

    const shootsCh = supabase
      .channel(`shoots-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shoots', filter: `org_id=eq.${orgId}` },
        async () => {
          try { setShoots(await fetchShoots(orgId)) } catch (e) { console.error(e) }
        })
      .subscribe()

    const clientsCh = supabase
      .channel(`clients-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `org_id=eq.${orgId}` },
        async () => {
          try { setClients(await fetchClients(orgId)) } catch (e) { console.error(e) }
        })
      .subscribe()

    return () => {
      supabase.removeChannel(shootsCh)
      supabase.removeChannel(clientsCh)
    }
  }, [orgId])
}
