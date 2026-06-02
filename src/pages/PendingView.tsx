// StockShot — Pending / Missing Items View

import { useState } from 'react'
import { Books, CheckCircle, MagnifyingGlass, ArrowUp, ArrowDown, DownloadSimple, FilePdf } from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { exportMissingItemsCSV } from '../lib/csvExport'
import { exportMissingItemsPDF } from '../lib/pdfExporter'
import { Button } from '../components/ui/Button'

export default function PendingView() {
  useNavSync({ onEnter: 'pull' })
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const getPending = useAppStore(s => s.getPending)
  const pendingIsMeaningful = useAppStore(s => s.pendingIsMeaningful)
  const getActiveShoot = useAppStore(s => s.getActiveShoot)

  const shoot = getActiveShoot()
  const meaningful = pendingIsMeaningful()
  const pending = getPending()

  const filtered = pending
    .filter(i => {
      if (!search) return true
      const q = search.toLowerCase()
      return i.styleNumber.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const cmp = a.styleNumber.localeCompare(b.styleNumber)
      return sortAsc ? cmp : -cmp
    })

  if (!shoot) {
    return <div className="p-8 text-center text-neutral-400">No active shoot.</div>
  }

  if (!meaningful) {
    return (
      <div className="p-8 text-center">
        <Books size={48} weight="duotone" className="mx-auto mb-3 text-neutral-400" />
        <p className="text-[15px] font-medium text-neutral-900 mb-1.5">Reference file mode</p>
        <p className="text-[12px] text-neutral-500">
          This shoot was imported as a mapping reference.<br />
          Outstanding items are not tracked — scan items in freely.
        </p>
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className="p-8 text-center">
        <CheckCircle size={48} weight="fill" className="mx-auto mb-3 text-[var(--color-success)]" />
        <p className="text-[15px] font-medium text-neutral-900 mb-1">All items scanned in!</p>
        <p className="text-[12px] text-neutral-500">No outstanding items remaining.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-2.5 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] flex items-center gap-2.5 flex-wrap">
        <span className="text-[16px] font-bold text-neutral-900">Missing Items</span>
        <span className="bg-[var(--color-warning)] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
          {pending.length}
        </span>
        <div className="flex-1" />

        <div className="flex items-center gap-1.5 bg-white border border-[var(--color-border)] rounded-lg px-2.5 py-1.5">
          <MagnifyingGlass size={13} className="text-neutral-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="border-none outline-none text-[12px] w-36 bg-transparent"
          />
        </div>

        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="p-1.5 bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-md cursor-pointer flex items-center text-neutral-600 hover:bg-[var(--color-border)]"
        >
          {sortAsc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>

        <Button variant="secondary" size="sm" onClick={() => exportMissingItemsCSV(filtered)}>
          <DownloadSimple size={13} className="mr-1" /> XLS
        </Button>
        <Button variant="secondary" size="sm" onClick={() => exportMissingItemsPDF(filtered)}>
          <FilePdf size={13} className="mr-1" /> PDF
        </Button>
      </div>

      {/* Column headers */}
      <div className="flex px-4 py-1.5 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] text-[11px] font-semibold text-neutral-500">
        <span className="w-9 text-center">#</span>
        <span className="w-[150px]">Style Number</span>
        <span className="flex-1">Description</span>
        <span className="w-[140px]">SKU</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto bg-white">
        {filtered.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-center border-b border-[var(--color-border)]/50 ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--color-surface-muted)]'}`}
          >
            <div className="w-0.5 self-stretch bg-[var(--color-warning)] shrink-0" />
            <div className="flex flex-1 items-center px-3.5 py-2.5">
              <span className="w-8 text-center text-[11px] text-neutral-400">{i + 1}</span>
              <span className="w-[150px] text-[13px] text-neutral-900 font-medium">{item.styleNumber}</span>
              <span className="flex-1 text-[12px] text-neutral-500 truncate">
                {item.description || '—'}
              </span>
              <span className="w-[140px] text-[12px] text-neutral-400 font-mono">{item.sku}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
