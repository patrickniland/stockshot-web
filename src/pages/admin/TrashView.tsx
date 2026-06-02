// StockShot — Admin: Trash (restore + permanent delete)

import { useState } from 'react'
import { Trash, ArrowCounterClockwise } from '@phosphor-icons/react'
import useAppStore from '../../store/useAppStore'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

export default function TrashView() {
  const getTrashedShoots = useAppStore(s => s.getTrashedShoots)
  const restoreShoot = useAppStore(s => s.restoreShoot)
  const permanentlyDeleteShoot = useAppStore(s => s.permanentlyDeleteShoot)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  const trashedShoots = getTrashedShoots()
  const confirmShoot = trashedShoots.find(s => s.id === confirmId)

  return (
    <div className="p-8 max-w-[700px]">
      <h2 className="text-[18px] font-bold text-neutral-900 mb-1.5">Trash</h2>
      <p className="text-[12px] text-neutral-400 mb-8">
        Shoots moved to trash are recoverable for 30 days. Permanent deletion cannot be undone.
      </p>

      {trashedShoots.length === 0 ? (
        <div className="text-center py-12">
          <Trash size={40} weight="duotone" className="mx-auto mb-2.5 text-neutral-300" />
          <p className="text-[14px] text-neutral-400">Trash is empty</p>
        </div>
      ) : trashedShoots.map(shoot => {
        const deletedDate = new Date(shoot.deletedAt!)
        const expiresMs = deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000
        const daysLeft = Math.ceil((expiresMs - Date.now()) / (1000 * 60 * 60 * 24))

        return (
          <div key={shoot.id} className="bg-white border border-[var(--color-danger)]/30 rounded-[var(--radius-lg)] px-4 py-4 mb-2.5 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-neutral-700">{shoot.name}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                {shoot.items.length} items · Deleted {deletedDate.toLocaleDateString('en-ZA')} · {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => restoreShoot(shoot)}
              className="shrink-0 text-[var(--color-success)] border-[var(--color-success)]/40 hover:bg-[var(--color-success)]/10"
            >
              <ArrowCounterClockwise size={13} className="mr-1" /> Restore
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => { setConfirmId(shoot.id); setConfirmInput('') }}
              className="shrink-0"
            >
              Delete Forever
            </Button>
          </div>
        )
      })}

      {/* Permanent delete confirmation */}
      {confirmShoot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
          <Card padding="lg" className="w-[380px] shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
            <h3 className="text-[16px] font-bold text-[var(--color-danger)] mb-2.5">
              Permanently delete shoot?
            </h3>
            <p className="text-[13px] text-neutral-600 mb-4">
              This will permanently delete <strong>{confirmShoot.name}</strong> and all {confirmShoot.items.length} items. This cannot be undone.
            </p>
            <p className="text-[12px] text-neutral-400 mb-2">
              Type the shoot name to confirm:
            </p>
            <input
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={confirmShoot.name}
              className="w-full box-border px-2.5 py-2 border border-[var(--color-border)] rounded-md text-[13px] outline-none mb-4"
            />
            <div className="flex gap-2.5">
              <Button
                variant="danger"
                size="sm"
                onClick={() => { permanentlyDeleteShoot(confirmShoot); setConfirmId(null); setConfirmInput('') }}
                disabled={confirmInput !== confirmShoot.name}
              >
                Delete Forever
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setConfirmId(null); setConfirmInput('') }}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
