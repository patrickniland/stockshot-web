// StockShot — Navigation-based sync hook
// Fires push-before-pull on page enter, push on page leave.

import { useEffect, useRef } from 'react'
import useAppStore from '../store/useAppStore'
import { pushDirty, pullSince, pullAll } from './useSupabaseSync'

interface NavSyncConfig {
  onEnter?: 'pull' | 'pullAll' | null
  onLeave?: 'push' | null
}

export function useNavSync({ onEnter = null, onLeave = null }: NavSyncConfig) {
  const didRun = useRef(false)

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (didRun.current) return
    didRun.current = true

    async function enter() {
      if (!onEnter) return

      const { dirtyItemIds, deletedShootIds, deletedClientIds, lastPulledAt } = useAppStore.getState()

      // Push before pull — never pull over unsaved local changes or pending deletes
      if (dirtyItemIds.length > 0 || deletedShootIds.length > 0 || deletedClientIds.length > 0) {
        const { failed } = await pushDirty()
        if (failed.length > 0) return
      }

      if (onEnter === 'pull') {
        await pullSince(lastPulledAt)
      } else if (onEnter === 'pullAll') {
        await pullAll()
      }
    }

    enter()

    return () => {
      // Fire-and-forget push on leave — failed items stay in dirtyItemIds
      // and will be retried on the next page's onEnter push-before-pull.
      if (onLeave === 'push') {
        const { dirtyItemIds } = useAppStore.getState()
        if (dirtyItemIds.length > 0) {
          pushDirty().catch(() => {/* retried on next nav */})
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
