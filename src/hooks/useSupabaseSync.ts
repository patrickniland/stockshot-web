// StockShot — Supabase Sync Hook
// Uses polling every 5 seconds as reliable cross-device sync

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchShoots, fetchClients, upsertShoot, upsertClient, deleteShoot, deleteClientFromDB } from '../lib/db'
import useAppStore from '../store/useAppStore'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSyncedAt = useRef<string>('')

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
        lastSyncedAt.current = new Date().toISOString()
      } catch (e) {
        console.error('[Sync] Initial load failed:', e)
      } finally {
        setLoaded(true)
      }
    }
    loadData()
  }, [orgId])

  // Save to Supabase when local data changes (debounced)
  useEffect(() => {
    if (!orgId || !loaded) return
    if (syncTimeout.current) clearTimeout(syncTimeout.current)

    syncTimeout.current = setTimeout(async () => {
      try {
        await Promise.all(savedShoots.map(s => upsertShoot(s, orgId!)))
        if (deletedShootIds?.length) {
          await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
        }
        lastSyncedAt.current = new Date().toISOString()
      } catch (e) {
        console.error('[Sync] Save error:', e)
      }
    }, 1500)

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
        console.error('[Sync] Client save error:', e)
      }
    }
    syncClients()
  }, [clients, deletedClientIds, orgId, loaded])

  // Poll every 5 seconds for changes from other devices
  useEffect(() => {
    if (!orgId || !loaded) return

    pollInterval.current = setInterval(async () => {
      try {
        // Check if any shoots were updated more recently than our last sync
        const { data } = await supabase
          .from('shoots')
          .select('updated_at')
          .eq('org_id', orgId)
          .gt('updated_at', lastSyncedAt.current)
          .limit(1)

        if (data && data.length > 0) {
          // Someone else made changes — reload
          const shoots = await fetchShoots(orgId!)
          setShoots(shoots)
          lastSyncedAt.current = new Date().toISOString()
        }
      } catch (e) {
        // Silent fail on poll errors
      }
    }, 5000)

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current)
    }
  }, [orgId, loaded])
}
