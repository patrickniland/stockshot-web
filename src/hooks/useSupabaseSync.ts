// StockShot — Manual Sync Hook
// No automatic loops. User controls when to push/pull.
// On app load: fetch from Supabase once.
// Push: save local state to Supabase on demand.
// Pull: fetch latest from Supabase on demand.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  fetchShoots,
  fetchItemsForShoot,
  fetchClients,
  upsertShootMeta,
  upsertItems,
  upsertClient,
  deleteShoot,
  deleteClientFromDB,
} from '../lib/db'
import useAppStore from '../store/useAppStore'
import { Shoot } from '../types'

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'error' | 'success'

export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const loadedRef = useRef(false)

  const setShoots = useAppStore(s => s.setShoots)
  const setClients = useAppStore(s => s.setClients)
  const activeShootId = useAppStore(s => s.activeShootId)
  const setActiveShootId = useAppStore(s => s.setActiveShootId)

  // ── Load on startup (once only) ───────────────────────────────────────────
  useEffect(() => {
    if (!orgId || loadedRef.current) return
    loadedRef.current = true

    async function loadAll() {
      setStatus('pulling')
      try {
        const [shootMetas, clients] = await Promise.all([
          fetchShoots(orgId!),
          fetchClients(orgId!),
        ])

        const shoots = await Promise.all(
          shootMetas.map(async meta => ({
            ...meta,
            items: await fetchItemsForShoot(meta.id),
          }))
        )

        // Backfill: create Unassigned shoot for any client that doesn't have one
        const clientsMissingUnassigned = clients.filter(c =>
          !shoots.some(s => s.clientId === c.id && s.isUnassigned)
        )
        if (clientsMissingUnassigned.length > 0) {
          const rows = clientsMissingUnassigned.map(c => ({
            id: crypto.randomUUID(),
            name: `${c.name} — Unassigned`,
            client_id: c.id,
            org_id: orgId!,
            is_unassigned: true,
            drops: [],
            look_order: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
          const { data: created } = await supabase.from('shoots').insert(rows).select()
          if (created) {
            const newShoots: Shoot[] = created.map(row => ({
              id: row.id,
              name: row.name,
              clientId: row.client_id,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              drops: [],
              lookOrder: [],
              deletedAt: null,
              isUnassigned: true,
              items: [],
            }))
            shoots.push(...newShoots)
          }
        }

        setShoots(shoots)
        setClients(clients)

        const activeShoots = shoots.filter(s => !s.deletedAt)
        if (activeShoots.length > 0) {
          const currentExists = activeShoots.some(s => s.id === activeShootId)
          if (!activeShootId || !currentExists) {
            setActiveShootId(activeShoots[0].id)
          }
        }

        setStatus('success')
        setTimeout(() => setStatus('idle'), 2000)
      } catch (e) {
        console.error('[Sync] Load failed:', e)
        setStatus('error')
      } finally {
        setLoaded(true)
      }
    }

    loadAll()
  }, [orgId])

  // ── Push: save local state to Supabase ────────────────────────────────────
  async function push() {
    if (!orgId) return
    setStatus('pushing')
    try {
      const { savedShoots, clients, deletedShootIds, deletedClientIds } = useAppStore.getState()

      // Save shoot metadata
      await Promise.all(savedShoots.map(s => upsertShootMeta(s, orgId)))

      // Save all items for each shoot
      await Promise.all(
        savedShoots.map(s => upsertItems(s.items, s.id, orgId))
      )

      // Save clients
      await Promise.all(clients.map(c => upsertClient(c, orgId)))

      // Delete removed shoots and clients
      if (deletedShootIds?.length) {
        await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
      }
      if (deletedClientIds?.length) {
        await Promise.all(deletedClientIds.map(id => deleteClientFromDB(id)))
      }

      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (e) {
      console.error('[Sync] Push failed:', e)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  // ── Pull: fetch latest from Supabase ──────────────────────────────────────
  async function pull() {
    if (!orgId) return
    setStatus('pulling')
    try {
      const [shootMetas, clients] = await Promise.all([
        fetchShoots(orgId),
        fetchClients(orgId),
      ])

      const shoots = await Promise.all(
        shootMetas.map(async meta => ({
          ...meta,
          items: await fetchItemsForShoot(meta.id),
        }))
      )

      setShoots(shoots)
      setClients(clients)

      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (e) {
      console.error('[Sync] Pull failed:', e)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return { loaded, status, push, pull }
}
