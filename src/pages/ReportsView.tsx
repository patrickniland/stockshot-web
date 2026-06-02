// StockShot — Dashboard / Reports View

import { ChartBar } from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { Card } from '../components/ui/Card'

export default function ReportsView() {
  useNavSync({ onEnter: 'pull' })
  const getActiveShoot = useAppStore(s => s.getActiveShoot)
  const getItems        = useAppStore(s => s.getItems)
  const getShot         = useAppStore(s => s.getShot)
  const clientName      = useAppStore(s => s.clientName)

  const shoot      = getActiveShoot()
  const items      = getItems()
  const shot       = getShot()
  const total      = items.length

  // Mapped = imported but not yet scanned in (no custody history)
  const mapped     = items.filter(i => (i.custodyHistory ?? []).length === 0).length
  // Active = has been scanned at least once
  const active     = items.filter(i => (i.custodyHistory ?? []).length > 0).length

  const notRequired = items.filter(i => i.shotStatus === 'notRequired').length

  // Custody breakdown (active items only)
  const atStudio   = items.filter(i => i.custodyLocation === 'at_studio').length
  const atClient   = items.filter(i => i.custodyLocation === 'at_client' && (i.custodyHistory ?? []).length > 0).length
  const inTransit  = items.filter(i => i.custodyLocation === 'in_transit').length

  // Left to shoot = at studio and not yet shot (actionable now)
  const toShoot    = items.filter(i => i.custodyLocation === 'at_studio' && i.shotStatus === 'notShot').length

  // Shot denominator excludes N/A items so 100% is reachable
  const shotBase   = active - notRequired

  // Angle completion stats
  const itemsWithAngles = items.filter(i => i.requiredAngles.length > 0)
  const fullyShot = itemsWithAngles.filter(i =>
    i.requiredAngles.every(a => i.completedAngles.includes(a))
  ).length
  const partiallyShot = itemsWithAngles.filter(i =>
    i.completedAngles.length > 0 &&
    !i.requiredAngles.every(a => i.completedAngles.includes(a))
  ).length

  if (!shoot) {
    return (
      <div className="p-8 text-center">
        <ChartBar size={48} weight="duotone" className="mx-auto mb-3 text-neutral-400" />
        <p className="font-medium text-neutral-500">No active shoot</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-6 max-w-[860px]">

      {/* Header */}
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-[22px] font-semibold text-neutral-900 m-0">Dashboard</h1>
        <span className="text-[14px] text-neutral-500">— {shoot.name}</span>
        {clientName(shoot.clientId) && (
          <span className="text-[12px] text-neutral-400">({clientName(shoot.clientId)})</span>
        )}
      </div>

      {/* KPI tiles — row 1: custody overview */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <KpiTile value={mapped}   label="Mapped"    token="muted"   />
        <KpiTile value={active}   label="Active"    token="success" />
        <KpiTile value={atStudio} label="At Studio" token="info"    />
        <KpiTile value={atClient} label="At Client" token="warning" />
      </div>

      {/* KPI tiles — row 2: shot progress */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiTile value={`${shot.length}/${shotBase}`} label="Shot"          token="accent"  />
        <KpiTile value={toShoot}                      label="Left to Shoot" token="warning" />
        <KpiTile value={inTransit}                    label="In Transit"    token="info"    />
        <KpiTile value={notRequired}                  label="N/A"           token="muted"   />
      </div>

      {/* Progress bars */}
      <Card padding="md" className="mb-6">
        <p className="text-[13px] font-semibold text-neutral-500 mb-3.5">Progress</p>
        <ProgressBar label="Active (of total imported)" value={active}      total={total}    bgClass="bg-[var(--color-success)]" />
        <ProgressBar label="At Studio"                  value={atStudio}    total={active}   bgClass="bg-[var(--color-info)]" />
        <ProgressBar label="Shot (of active)"           value={shot.length} total={shotBase} bgClass="bg-[var(--color-accent)]" />
        <ProgressBar label="Left to shoot"              value={toShoot}     total={active}   bgClass="bg-[var(--color-warning)]" />
        {itemsWithAngles.length > 0 && (
          <>
            <ProgressBar label="All angles complete" value={fullyShot}     total={itemsWithAngles.length} bgClass="bg-[var(--color-accent)]" />
            <ProgressBar label="Partially shot"      value={partiallyShot} total={itemsWithAngles.length} bgClass="bg-[var(--color-warning)]" />
          </>
        )}
      </Card>

      {/* Angle completion detail */}
      {itemsWithAngles.length > 0 && (
        <Card padding="md" className="mb-6">
          <p className="text-[13px] font-semibold text-neutral-500 mb-3">Angle Tracking</p>
          <div className="grid grid-cols-3 gap-2.5">
            <KpiTile value={`${fullyShot}/${itemsWithAngles.length}`}            label="All Angles Done" token="accent"  />
            <KpiTile value={partiallyShot}                                        label="Partially Shot"  token="warning" />
            <KpiTile value={itemsWithAngles.length - fullyShot - partiallyShot}  label="Not Started"     token="muted"   />
          </div>
        </Card>
      )}

      {/* Drop breakdown */}
      {shoot.drops.length > 0 && (
        <Card padding="md">
          <p className="text-[13px] font-semibold text-neutral-500 mb-3">Drops / Batches</p>
          {shoot.drops.map(drop => (
            <div key={drop.id} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--color-border)]/50 last:border-0">
              <span className="text-[12px] text-neutral-700 flex-1">{drop.name}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                drop.importMode === 'jobList'
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'bg-[var(--color-info)]/10 text-[var(--color-info)]'
              }`}>
                {drop.importMode === 'jobList' ? 'Job List' : 'Reference'}
              </span>
              <span className="text-[11px] text-neutral-400">{drop.itemCount} items</span>
              <span className="text-[10px] text-neutral-300">{new Date(drop.importedAt).toLocaleDateString('en-ZA')}</span>
            </div>
          ))}
        </Card>
      )}

    </div>
  )
}

type TokenColor = 'success' | 'warning' | 'info' | 'accent' | 'muted'

const TOKEN_MAP: Record<TokenColor, { value: string; border: string }> = {
  success: { value: 'text-[var(--color-success)]', border: 'border-[var(--color-success)]/20' },
  warning: { value: 'text-[var(--color-warning)]', border: 'border-[var(--color-warning)]/20' },
  info:    { value: 'text-[var(--color-info)]',    border: 'border-[var(--color-info)]/20'    },
  accent:  { value: 'text-[var(--color-accent)]',  border: 'border-[var(--color-accent)]/20'  },
  muted:   { value: 'text-neutral-400',            border: 'border-neutral-200'               },
}

function KpiTile({ value, label, token }: { value: number | string; label: string; token: TokenColor }) {
  const { value: valueClass, border: borderClass } = TOKEN_MAP[token]
  return (
    <div className={`bg-white border ${borderClass} rounded-[var(--radius-lg)] py-5 px-3 text-center`}>
      <div className={`text-[32px] font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  )
}

function ProgressBar({ label, value, total, bgClass }: { label: string; value: number; total: number; bgClass: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-[12px] text-neutral-900">{label}</span>
        <span className="text-[11px] text-neutral-500">{value} / {total} ({pct}%)</span>
      </div>
      <div className="bg-[var(--color-border)] rounded h-2 overflow-hidden">
        <div className={`h-full ${bgClass} rounded transition-all duration-300 ease-in-out`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
