// StockShot — Supabase Real-time Sync Hook

import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchShoots, fetchClients, upsertShoot, upsertClient, deleteShoot, deleteClientFromDB } from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInitialLoad = useRef(true)
  const isSyncing = useRef(false)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const savedShoots = useAppStore(s => s.savedShoots)
  const clients = useAppStore(s => s.clients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)
  const deletedShootIds = useAppStore(s => s.deletedShootIds)
  const deletedClientIds = useAppStore(s => s.deletedClientIds)

  // Initial load — fetch all data from Supabase
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
        // Mark initial load done after a short delay
        // to prevent the load from triggering a re-save
        setTimeout(() => { isInitialLoad.current = false }, 2000)
      } catch (e) {
        console.error('Failed to load from Supabase:', e)
        isInitialLoad.current = false
      }
    }
    loadData()
  }, [orgId])

  // Sync shoots to Supabase when they change (debounced 1.5s)
  useEffect(() => {
    if (!orgId || isInitialLoad.current || isSyncing.current) return
    if (syncTimeout.current) clearTimeout(syncTimeout.current)

    syncTimeout.current = setTimeout(async () => {
      isSyncing.current = true
      try {
        await Promise.all(savedShoots.map(s => upsertShoot(s, orgId!)))
        if (deletedShootIds?.length) {
          await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
        }
      } catch (e) {
        console.error('Shoot sync error:', e)
      } finally {
        isSyncing.current = false
      }
    }, 1500)

    return () => { if (syncTimeout.current) clearTimeout(syncTimeout.current) }
  }, [savedShoots, deletedShootIds, orgId])

  // Sync clients
  useEffect(() => {
    if (!orgId || isInitialLoad.current) return
    async function syncClients() {
      try {
        await Promise.all(clients.map(c => upsertClient(c, orgId!)))
        if (deletedClientIds?.length) {
          await Promise.all(deletedClientIds.map(id => deleteClientFromDB(id)))
        }
      } catch (e) {
        console.error('Client sync error:', e)
      }
    }
    syncClients()
  }, [clients, deletedClientIds, orgId])

  // Real-time subscriptions — listen for changes from other devices
  useEffect(() => {
    if (!orgId) return

    const shootsCh = supabase
      .channel(`shoots-${orgId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'shoots',
        filter: `org_id=eq.${orgId}`,
      }, async (payload) => {
        // Another device made a change — reload shoots
        // Skip if we triggered this ourselves
        if (isSyncing.current) return
        try {
          const shoots = await fetchShoots(orgId!)
          setShoots(shoots)
        } catch (e) {
          console.error('Real-time shoots sync error:', e)
        }
      })
      .subscribe()

    const clientsCh = supabase
      .channel(`clients-${orgId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clients',
        filter: `org_id=eq.${orgId}`,
      }, async () => {
        if (isSyncing.current) return
        try {
          setClients(await fetchClients(orgId!))
        } catch (e) {
          console.error('Real-time clients sync error:', e)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(shootsCh)
      supabase.removeChannel(clientsCh)
    }
  }, [orgId])
}
