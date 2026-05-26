// StockShot — Navigation-based sync hook
// Fires push-before-pull on page enter, push on page leave.

import { useEffect } from 'react'
import useAppStore from '../store/useAppStore'
import { pushDirty, pullSince, pullAll } from './useSupabaseSync'

interface NavSyncConfig {
  onEnter?: 'pull' | 'pullAll' | null
  onLeave?: 'push' | null
}

export function useNavSync({ onEnter = null, onLeave = null }: NavSyncConfig) {
  useEffect(() => {
    let cancelled = false

    async function enter() {
      if (!onEnter) return

      const { dirtyItemIds, lastPulledAt } = useAppStore.getState()

      // Push before pull — never pull over unsaved local changes
      if (dirtyItemIds.length > 0) {
        const { failed } = await pushDirty()
        if (cancelled) return
        if (failed.length > 0) {
          // Push failed: leave local state alone, skip pull
          return
        }
      }

      if (cancelled) return

      if (onEnter === 'pull') {
        await pullSince(lastPulledAt)
      } else if (onEnter === 'pullAll') {
        await pullAll()
      }
    }

    enter()

    return () => {
      cancelled = true
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
