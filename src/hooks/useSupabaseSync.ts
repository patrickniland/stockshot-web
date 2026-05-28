// StockShot — Sync Engine
// Standalone functions (pushDirty, pullSince, pullAll) are called by useNavSync on navigation.
// The hook handles startup-only: full pull on first load.

import { useEffect, useRef, useState } from 'react'
import {
  fetchShoots,
  fetchItemsForShoot,
  fetchClients,
  fetchItemsSince,
  fetchShootsSince,
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

  // If local store has no shoots, a partial pull is useless — fetch everything
  if (store.savedShoots.length === 0) { await pullAll(); return }

  const pullId = ++activePullId
  store.setSyncStatus('syncing')

  try {
    const [updatedItems, updatedShootMetas] = await Promise.all([
      fetchItemsSince(orgId, since),
      fetchShootsSince(orgId, since),
    ])
    if (pullId !== activePullId) return

    // Fetch full items for any shoots that are new to this device
    const existingShootIds = new Set(store.savedShoots.map(s => s.id))
    const newShootMetas = updatedShootMetas.filter(m => !existingShootIds.has(m.id))
    const newShootsWithItems = await Promise.all(
      newShootMetas.map(async meta => ({
        ...meta,
        items: await fetchItemsForShoot(meta.id),
      }))
    )
    if (pullId !== activePullId) return

    store.mergeItems(updatedItems)
    if (updatedShootMetas.length > 0 || newShootsWithItems.length > 0) {
      store.mergeShoots(updatedShootMetas, newShootsWithItems)
    }

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

    // Preserve local items for shoots that are ahead of DB.
    // This handles the race where items were added locally but the async upsert
    // hasn't finished yet — pullAll would otherwise wipe them with an empty array.
    const localShoots = useAppStore.getState().savedShoots
    const mergedShoots = shoots.map(dbShoot => {
      const local = localShoots.find(s => s.id === dbShoot.id)
      if (local && local.items.length > dbShoot.items.length) {
        return { ...dbShoot, items: local.items }
      }
      return dbShoot
    })
    // Also keep shoots that exist locally but aren't in DB yet (import in flight)
    const dbShootIds = new Set(shoots.map(s => s.id))
    const localOnly = localShoots.filter(s => !dbShootIds.has(s.id))
    const allShoots = [...mergedShoots, ...localOnly]

    store.setShoots(allShoots)
    store.setClients(clients)

    const activeShoots = allShoots.filter(s => !s.deletedAt)
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
