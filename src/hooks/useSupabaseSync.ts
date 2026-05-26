// StockShot — Sync Engine
// Standalone functions (pushDirty, pullSince, pullAll) are called by useNavSync on navigation.
// The hook handles startup-only: full pull on first load.

import { useEffect, useRef, useState } from 'react'
import {
  fetchShoots,
  fetchItemsForShoot,
  fetchClients,
  fetchItemsSince,
  upsertItem,
  deleteShoot,
  deleteClientFromDB,
} from '../lib/db'
import useAppStore from '../store/useAppStore'

// ── Concurrency guard ─────────────────────────────────────────────────────────
// Tracks in-flight pull so a newer nav can supersede an older one.
let activePullId = 0

// ── pushDirty ─────────────────────────────────────────────────────────────────
export async function pushDirty(): Promise<{ pushed: number; failed: string[] }> {
  const store = useAppStore.getState()
  const { dirtyItemIds, savedShoots, orgId, deletedShootIds, deletedClientIds } = store

  if (!orgId) return { pushed: 0, failed: [] }
  if (dirtyItemIds.length === 0 && !deletedShootIds.length && !deletedClientIds.length) {
    return { pushed: 0, failed: [] }
  }

  store.setSyncStatus('syncing')

  const pushed: string[] = []
  const failed: string[] = []

  // Push only dirty stock items — never mass-upsert all shoots (causes last-write-wins conflicts)
  await Promise.all(dirtyItemIds.map(async (itemId) => {
    let foundItem = null
    let foundShootId = null
    for (const shoot of savedShoots) {
      const item = shoot.items.find(i => i.id === itemId)
      if (item) { foundItem = item; foundShootId = shoot.id; break }
    }
    if (!foundItem || !foundShootId) {
      pushed.push(itemId) // item gone, remove from dirty
      return
    }
    try {
      await upsertItem(foundItem, foundShootId, orgId)
      pushed.push(itemId)
    } catch {
      failed.push(itemId)
    }
  }))

  store.clearDirty(pushed)

  // Process pending deletes and clear them so they don't fire again on next push
  try {
    if (deletedShootIds.length) {
      await Promise.all(deletedShootIds.map(id => deleteShoot(id)))
      store.clearDeletedShootIds(deletedShootIds)
    }
    if (deletedClientIds.length) {
      await Promise.all(deletedClientIds.map(id => deleteClientFromDB(id)))
      store.clearDeletedClientIds(deletedClientIds)
    }
  } catch (e) {
    console.error('[Sync] push deletes error:', e)
  }

  const now = new Date().toISOString()
  if (failed.length === 0) {
    store.setSyncStatus('idle')
    store.setLastSyncedAt(now)
    store.setLastPulledAt(now)
  } else {
    store.setSyncStatus('error')
  }

  return { pushed: pushed.length, failed }
}

// ── pullSince ─────────────────────────────────────────────────────────────────
export async function pullSince(since: string | null): Promise<void> {
  if (!since) { await pullAll(); return }

  const store = useAppStore.getState()
  const { orgId } = store
  if (!orgId) return

  const pullId = ++activePullId
  store.setSyncStatus('syncing')

  try {
    const updatedItems = await fetchItemsSince(orgId, since)
    if (pullId !== activePullId) return // superseded

    store.mergeItems(updatedItems)
    const now = new Date().toISOString()
    store.setLastPulledAt(now)
    store.setLastSyncedAt(now)
    store.setSyncStatus('idle')
  } catch (e) {
    if (pullId !== activePullId) return
    console.error('[Sync] pullSince failed:', e)
    store.setSyncStatus('error')
  }
}

// ── pullAll ───────────────────────────────────────────────────────────────────
export async function pullAll(): Promise<void> {
  const store = useAppStore.getState()
  const { orgId, activeShootId } = store
  if (!orgId) return

  const pullId = ++activePullId
  store.setSyncStatus('syncing')

  try {
    const [shootMetas, clients] = await Promise.all([
      fetchShoots(orgId),
      fetchClients(orgId),
    ])

    if (pullId !== activePullId) return

    const shoots = await Promise.all(
      shootMetas.map(async meta => ({
        ...meta,
        items: await fetchItemsForShoot(meta.id),
      }))
    )

    if (pullId !== activePullId) return

    store.setShoots(shoots)
    store.setClients(clients)

    const activeShoots = shoots.filter(s => !s.deletedAt)
    if (activeShoots.length > 0) {
      const currentExists = activeShoots.some(s => s.id === activeShootId)
      if (!activeShootId || !currentExists) {
        store.setActiveShootId(activeShoots[0].id)
      }
    }

    const now = new Date().toISOString()
    store.setLastPulledAt(now)
    store.setLastSyncedAt(now)
    store.setSyncStatus('idle')
  } catch (e) {
    if (pullId !== activePullId) return
    console.error('[Sync] pullAll failed:', e)
    store.setSyncStatus('error')
  }
}

// ── Hook (startup only) ───────────────────────────────────────────────────────
export function useSupabaseSync(orgId: string | null) {
  const [loaded, setLoaded] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!orgId || loadedRef.current) return
    loadedRef.current = true
    pullAll().finally(() => setLoaded(true))
  }, [orgId])

  return { loaded }
}
