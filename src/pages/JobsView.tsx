// StockShot — Jobs / Shoots View

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Buildings, CaretDown, CaretRight, ArrowDown, Trash } from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { Shoot } from '../types'
import { Button } from '../components/ui/Button'

export default function JobsView() {
  useNavSync({ onEnter: 'pull' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedDrops, setExpandedDrops] = useState<string | null>(null)

  const savedShoots = useAppStore(s => s.savedShoots)
  const activeShootId = useAppStore(s => s.activeShootId)
  const switchToShoot = useAppStore(s => s.switchToShoot)
  const navigate = useNavigate()
  const softDeleteShoot = useAppStore(s => s.softDeleteShoot)
  const getActiveShoots = useAppStore(s => s.getActiveShoots)
  const renameActiveShoot = useAppStore(s => s.renameActiveShoot)
  const clientName = useAppStore(s => s.clientName)

  // Hide empty Unassigned shoots — they're system-managed holding areas, not real jobs.
  // Unassigned shoots with items remain visible so nothing is lost.
  const activeShoots = getActiveShoots().filter(s => !s.isUnassigned || s.items.length > 0)

  // Group by client
  const grouped: Record<string, Shoot[]> = {}
  for (const shoot of activeShoots) {
    const name = clientName(shoot.clientId) ?? 'No Client'
    if (!grouped[name]) grouped[name] = []
    grouped[name].push(shoot)
  }

  if (activeShoots.length === 0) {
    return (
      <div className="p-8 text-center">
        <FolderOpen size={48} weight="duotone" className="mx-auto mb-3 text-neutral-400" />
        <p className="font-medium text-neutral-900 mb-1.5">No shoots yet</p>
        <p className="text-[12px] text-neutral-500 mb-4">Import a stock file to create your first shoot.</p>
        <Button variant="primary" size="md" onClick={() => navigate('/import')}>
          Go to Import
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center mb-6 gap-3">
        <h1 className="text-[22px] font-semibold text-neutral-900 m-0">Shoots</h1>
        <span className="text-[13px] text-neutral-500">({activeShoots.length})</span>
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => navigate('/import')}>
          + New Import
        </Button>
      </div>

      {Object.entries(grouped).map(([client, shoots]) => (
        <div key={client} className="mb-6">
          {/* Client header */}
          <div className="flex items-center gap-2 mb-2 pl-1">
            <Buildings size={14} className="text-[var(--color-info)]" />
            <span className="text-[12px] font-bold text-[var(--color-info)]">{client}</span>
            <span className="text-[11px] text-neutral-400">· {shoots.length} shoot{shoots.length !== 1 ? 's' : ''}</span>
          </div>

          {shoots.map(shoot => {
            const isActive = shoot.id === activeShootId
            const showDrops = expandedDrops === shoot.id
            const mapped      = shoot.items.filter(i => (i.custodyHistory ?? []).length === 0).length
            const active      = shoot.items.filter(i => (i.custodyHistory ?? []).length > 0).length
            const atStudio    = shoot.items.filter(i => i.custodyLocation === 'at_studio').length
            const atClient    = shoot.items.filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0).length
            const notRequired = shoot.items.filter(i => i.shotStatus === 'notRequired').length
            const shotCount   = shoot.items.filter(i => i.shotStatus === 'shot').length
            const shotBase    = active - notRequired

            return (
              <div
                key={shoot.id}
                onClick={() => { if (!isActive) switchToShoot(shoot) }}
                className={`bg-white rounded-[var(--radius-lg)] mb-2 overflow-hidden transition-shadow ${
                  isActive
                    ? 'border-2 border-[var(--color-success)] cursor-default'
                    : 'border border-[var(--color-border)] cursor-pointer hover:shadow-md'
                }`}
              >
                <div className="flex flex-wrap items-start p-4 gap-3">
                  {/* Active indicator bar */}
                  <div className={`w-1 self-stretch rounded-full shrink-0 ${isActive ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`} />

                  <div className="flex-1">
                    {/* Name row */}
                    {editingId === shoot.id ? (
                      <div className="flex gap-2 mb-2">
                        <input
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-[var(--color-border)] rounded-md text-[14px]"
                        />
                        <Button variant="primary" size="sm" onClick={() => { renameActiveShoot(editingName); setEditingId(null) }}>
                          Save
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[14px] font-semibold text-neutral-900">{shoot.name}</span>
                        {isActive && (
                          <span className="text-[9px] font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded">
                            ACTIVE
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-[11px] text-neutral-400 mb-2.5">
                      Created {new Date(shoot.createdAt).toLocaleDateString('en-ZA')} · Updated {new Date(shoot.updatedAt).toLocaleDateString('en-ZA')}
                    </div>

                    {/* Stats */}
                    <div className={`flex gap-3.5 flex-wrap ${shoot.drops.length > 0 ? 'mb-2' : ''}`}>
                      <StatChip value={mapped}                        label="Mapped"    colorClass="text-neutral-400" />
                      <StatChip value={active}                        label="Active"    colorClass="text-[var(--color-success)]" />
                      <StatChip value={atStudio}                      label="At Studio" colorClass="text-[var(--color-info)]" />
                      <StatChip value={atClient}                      label="At Client" colorClass="text-[var(--color-warning)]" />
                      <StatChip value={`${shotCount}/${shotBase}`}    label="Shot"      colorClass="text-[var(--color-accent)]" />
                      <StatChip value={shoot.drops.length}            label={`Drop${shoot.drops.length !== 1 ? 's' : ''}`} colorClass="text-neutral-500" />
                    </div>

                    {/* Drops toggle */}
                    {shoot.drops.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedDrops(showDrops ? null : shoot.id) }}
                        className={`flex items-center gap-1 bg-transparent border-none text-[10px] text-[var(--color-info)] cursor-pointer p-0 ${showDrops ? 'mb-2' : ''}`}
                      >
                        {showDrops ? <CaretDown size={10} /> : <CaretRight size={10} />}
                        {showDrops ? 'Hide drops' : `Show ${shoot.drops.length} drop${shoot.drops.length !== 1 ? 's' : ''}`}
                      </button>
                    )}

                    {/* Drops list */}
                    {showDrops && (
                      <div className="flex flex-col gap-1">
                        {shoot.drops.map(drop => (
                          <div key={drop.id} className="flex items-center gap-1.5 bg-[var(--color-surface-muted)] rounded-md px-2 py-1.5 text-[10px] text-neutral-500">
                            <ArrowDown size={10} className="shrink-0" />
                            <span className="font-medium text-neutral-700">{drop.name}</span>
                            <span>·</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              drop.importMode === 'jobList'
                                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                                : 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
                            }`}>
                              {drop.importMode === 'jobList' ? 'Job List' : 'Reference'}
                            </span>
                            <span>·</span>
                            <span>{drop.itemCount} items</span>
                            <span>·</span>
                            <span>{new Date(drop.importedAt).toLocaleDateString('en-ZA')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-row flex-wrap lg:flex-col gap-1.5 shrink-0 w-full lg:w-auto">
                    {!isActive && (
                      <Button variant="primary" size="sm" onClick={e => { e.stopPropagation(); switchToShoot(shoot) }}>
                        Switch
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); setEditingId(shoot.id); setEditingName(shoot.name) }}>
                      Rename
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation()
                        if (confirm(`Move "${shoot.name}" to trash?\n\n${shoot.items.length} items will be recoverable for 30 days.`)) softDeleteShoot(shoot)
                      }}
                    >
                      <Trash size={12} className="mr-1" /> Trash
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function StatChip({ value, label, colorClass }: { value: string | number; label: string; colorClass: string }) {
  return (
    <div className="text-center">
      <div className={`text-[13px] font-bold ${colorClass}`}>{value}</div>
      <div className="text-[9px] text-neutral-400">{label}</div>
    </div>
  )
}
