// StockShot — Shot List View

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  FilmSlate, MagnifyingGlass, Package, Truck, Storefront,
  DotsSixVertical, CaretUp, CaretDown, DownloadSimple, FilePdf, Tag, SquaresFour,
} from '@phosphor-icons/react'
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { StockItem, ShotStatus } from '../types'
import { exportShotListCSV } from '../lib/csvExport'
import { exportShotListPDF, exportLabelGridPDF, LabelOptions } from '../lib/pdfExporter'
import QRCode from '../components/QRCode'
import LookBuilder from '../components/LookBuilder'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function ShotListView() {
  useNavSync({ onEnter: 'pull', onLeave: 'push' })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'notShot' | 'shot' | 'partial'>('all')
  const [groupBy, setGroupBy] = useState<'look' | 'productType' | 'none'>('look')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [showListPdfModal, setShowListPdfModal] = useState(false)
  const [listPdfIncludeLocation, setListPdfIncludeLocation] = useState(false)
  const [labelOptions, setLabelOptions] = useState<LabelOptions>({
    perRow: 4,
    groupBy: 'look',
    showStyleNumber: true,
    showDescription: true,
    showLookNumber: true,
    showQRValue: true,
  })
  const [exporting, setExporting] = useState(false)
  const [showLookBuilder, setShowLookBuilder] = useState(false)
  const [dragActiveId, setDragActiveId] = useState<number | null>(null)

  const savedShoots = useAppStore(s => s.savedShoots)
  const bumpLook = useAppStore(s => s.bumpLook)
  const activeShootId = useAppStore(s => s.activeShootId)
  const storeUpdateItem = useAppStore(s => s.updateItem)
  const storeToggleAngle = useAppStore(s => s.toggleAngle)
  const storeAssignProductType = useAppStore(s => s.assignProductType)
  const reorderLook = useAppStore(s => s.reorderLook)
  const clients = useAppStore(s => s.clients)
  const shotListLocationFilter = useAppStore(s => s.shotListLocationFilter)
  const setShotListLocationFilter = useAppStore(s => s.setShotListLocationFilter)
  const syncStatus = useAppStore(s => s.syncStatus)

  const shoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = shoot?.items ?? []

  // Only show items that have been formally scanned in (have custody history).
  const scannedItems = allItems.filter(i => (i.custodyHistory ?? []).length > 0)

  const locationFiltered = shotListLocationFilter === 'all'
    ? scannedItems
    : scannedItems.filter(i => i.custodyLocation === shotListLocationFilter)

  const client = clients.find(c => c.id === shoot?.clientId) ?? null
  const productTypes = client?.productTypes ?? []

  const filtered = locationFiltered.filter(i => {
    if (filter === 'notShot' && i.shotStatus !== 'notShot') return false
    if (filter === 'shot' && i.shotStatus !== 'shot') return false
    if (filter === 'partial') {
      if (i.requiredAngles.length === 0) return false
      if (i.completedAngles.length === 0 || i.completedAngles.length === i.requiredAngles.length) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return i.styleNumber.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
  })

  function assignProductType(itemId: string, productType: string) {
    storeAssignProductType(itemId, productType)
  }

  // ── dnd-kit ────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragStart(event: DragStartEvent) {
    setDragActiveId(event.active.id as number)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderLook(active.id as number, over.id as number)
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleLabelExport() {
    setExporting(true)
    try {
      await exportLabelGridPDF(filtered, labelOptions, shoot?.name)
    } finally {
      setExporting(false)
      setShowLabelModal(false)
    }
  }

  // ── Grouping ───────────────────────────────────────────────────────────────

  const groups: Array<{ name: string; look?: number; items: StockItem[] }> = []
  if (groupBy === 'look') {
    const presentLooks = new Set(filtered.flatMap(i => i.looks))
    const orderedLooks = [
      ...(shoot?.lookOrder ?? []),
      ...[...presentLooks].filter(l => !shoot?.lookOrder.includes(l)).sort((a, b) => a - b),
    ].filter(l => presentLooks.has(l))
    orderedLooks.forEach(look => {
      const gi = filtered.filter(i => i.looks.includes(look))
      if (gi.length) groups.push({ name: `Look ${look}`, look, items: gi })
    })
    const unassigned = filtered.filter(i => i.looks.length === 0)
    if (unassigned.length) groups.push({ name: 'No Look Assigned', items: unassigned })
  } else if (groupBy === 'productType') {
    const types = [...new Set(filtered.map(i => i.productType || 'Unassigned'))]
    types.forEach(type => {
      const gi = filtered.filter(i => (i.productType || 'Unassigned') === type)
      if (gi.length) groups.push({ name: type, items: gi })
    })
  } else {
    groups.push({ name: '', items: filtered })
  }

  const lookGroups = groupBy === 'look' ? groups.filter(g => g.look != null) : []
  const noLookGroup = groupBy === 'look' ? (groups.find(g => g.look == null) ?? null) : null

  // ── Shot row callbacks ─────────────────────────────────────────────────────

  function makeShotRowProps(item: StockItem, i: number) {
    return {
      item,
      index: i,
      expanded: expandedId === item.id,
      productTypes: productTypes.map(p => p.name),
      locationFilter: shotListLocationFilter,
      onToggle: () => setExpandedId(expandedId === item.id ? null : item.id),
      onAngleToggle: (angle: string) => storeToggleAngle(item.id, angle),
      onShotStatusChange: (s: ShotStatus) => {
        const now = new Date().toISOString()
        storeUpdateItem(item.id, {
          shotStatus: s,
          shotAt: s === 'shot' ? now : null,
          completedAngles: s === 'shot' ? item.requiredAngles : [],
        })
      },
      onAssignProductType: (pt: string) => assignProductType(item.id, pt),
    }
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!shoot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <FilmSlate size={64} weight="duotone" />
        <p className="font-medium text-slate-600">No active shoot</p>
      </div>
    )
  }

  const selectCls = 'px-2 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm bg-white text-slate-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]'

  return (
    <div className="flex flex-col h-full">

      {/* Location filter bar */}
      <div className="px-4 py-2 bg-white border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500 mr-1">Location:</span>
        {([
          { value: 'all',        label: 'All' },
          { value: 'at_studio',  label: 'At Studio' },
          { value: 'at_client',  label: 'At Client' },
          { value: 'in_transit', label: 'In Transit' },
        ] as const).map(opt => (
          <button
            key={opt.value}
            onClick={() => setShotListLocationFilter(opt.value)}
            className={`px-3 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer min-h-[36px] ${
              shotListLocationFilter === opt.value
                ? 'bg-[var(--color-info)]/10 border-[var(--color-info)] text-[var(--color-info)]'
                : 'bg-[var(--color-surface-muted)] border-[var(--color-border)] text-slate-500 hover:border-slate-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{scannedItems.length} scanned / {allItems.length} total</span>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2.5 bg-[var(--color-surface-muted)] border-b border-[var(--color-border)] flex items-center gap-2 flex-wrap">
        <span className="text-lg font-bold text-slate-900">Shot List</span>
        <span className="text-sm text-slate-500">({filtered.length} items)</span>
        <div className="flex-1" />

        <div className="flex items-center gap-1.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-1.5">
          <MagnifyingGlass size={13} className="text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="border-none outline-none text-sm w-28 bg-transparent text-slate-900 placeholder:text-slate-400"
          />
        </div>

        <select value={filter} onChange={e => setFilter(e.target.value as any)} className={selectCls}>
          <option value="all">All</option>
          <option value="notShot">Not Shot</option>
          <option value="partial">Partial</option>
          <option value="shot">Shot</option>
        </select>

        <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} className={selectCls}>
          <option value="look">Group by Look</option>
          <option value="productType">Group by Type</option>
          <option value="none">No Grouping</option>
        </select>

        <Button variant="secondary" size="sm" Icon={DownloadSimple} onClick={() => exportShotListCSV(filtered)}>XLS</Button>
        <Button variant="secondary" size="sm" Icon={FilePdf} onClick={() => setShowListPdfModal(true)}>List PDF</Button>
        <Button variant="secondary" size="sm" Icon={Tag} onClick={() => setShowLabelModal(true)}>Labels PDF</Button>
        <Button variant="primary" size="sm" Icon={SquaresFour} onClick={() => setShowLookBuilder(true)}>Look Builder</Button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No items here yet. Items appear once scanned in.
          </div>
        ) : groupBy === 'look' ? (
          <>
            <DndContext
              sensors={syncStatus === 'syncing' ? [] : sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={lookGroups.map(g => g.look!)}
                strategy={verticalListSortingStrategy}
              >
                {lookGroups.map((group, gi) => (
                  <SortableLookGroup
                    key={group.look}
                    lookId={group.look!}
                    groupName={group.name}
                    itemCount={group.items.length}
                    gi={gi}
                    totalLookGroups={lookGroups.length}
                    isDraggingAny={dragActiveId !== null}
                    onMoveUp={() => gi > 0 && reorderLook(group.look!, lookGroups[gi - 1].look!)}
                    onMoveDown={() => gi < lookGroups.length - 1 && reorderLook(group.look!, lookGroups[gi + 1].look!)}
                  >
                    {group.items.map((item, i) => (
                      <ShotRow key={item.id} {...makeShotRowProps(item, i)} />
                    ))}
                  </SortableLookGroup>
                ))}
              </SortableContext>

              <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
                {dragActiveId != null ? (
                  <div className="px-3 py-2 bg-[var(--color-accent)]/20 rounded-[var(--radius-md)] shadow-xl text-xs font-bold text-[var(--color-accent)] flex items-center gap-2 cursor-grabbing select-none border-2 border-[var(--color-accent)]/30">
                    <DotsSixVertical size={18} className="opacity-70 min-w-[44px] text-center flex-shrink-0" />
                    Look {dragActiveId}
                    <span className="opacity-60 font-normal">
                      · {lookGroups.find(g => g.look === dragActiveId)?.items.length ?? 0} items
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {/* No Look Assigned — not sortable, always at bottom */}
            {noLookGroup && (
              <div>
                <div className="px-4 py-2 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-xs font-bold border-b border-[var(--color-border)] sticky top-0 z-10">
                  No Look Assigned — {noLookGroup.items.length} item{noLookGroup.items.length !== 1 ? 's' : ''}
                </div>
                {noLookGroup.items.map((item, i) => (
                  <ShotRow key={item.id} {...makeShotRowProps(item, i)} />
                ))}
              </div>
            )}
          </>
        ) : (
          groups.map((group) => (
            <div key={group.name || 'all'}>
              {group.name && (
                <div className="px-4 py-2 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-xs font-bold border-b border-[var(--color-border)] sticky top-0 z-10">
                  {group.name} — {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </div>
              )}
              {group.items.map((item, i) => (
                <ShotRow key={item.id} {...makeShotRowProps(item, i)} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Look Builder panel */}
      {showLookBuilder && shoot && (
        <LookBuilder
          items={scannedItems}
          lookOrder={shoot.lookOrder}
          onUpdateItem={(itemId, looks) => storeUpdateItem(itemId, { looks })}
          onAddLook={() => bumpLook()}
          onClose={() => setShowLookBuilder(false)}
        />
      )}

      {/* List PDF modal */}
      {showListPdfModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <Card padding="lg" className="w-80 max-w-[90vw]">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">List PDF Options</h2>
            <label className="flex items-center gap-2 mb-4 cursor-pointer text-sm text-slate-600">
              <input type="checkbox" checked={listPdfIncludeLocation} onChange={e => setListPdfIncludeLocation(e.target.checked)} />
              Include Location column
            </label>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true)
                  try { await exportShotListPDF(filtered, groupBy === 'none' ? 'look' : groupBy, listPdfIncludeLocation, shoot?.name) }
                  finally { setExporting(false); setShowListPdfModal(false) }
                }}
              >
                {exporting ? 'Generating…' : `Export ${filtered.length} items`}
              </Button>
              <Button variant="ghost" onClick={() => setShowListPdfModal(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Label export modal */}
      {showLabelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <Card padding="lg" className="w-96 max-w-[90vw]">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Label Grid PDF</h2>

            <div className="mb-3">
              <label className="text-xs text-slate-500 block mb-1.5">Labels per row</label>
              <div className="flex gap-2">
                {([4, 8] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setLabelOptions(o => ({ ...o, perRow: n }))}
                    className={`flex-1 py-2 rounded-[var(--radius-md)] text-sm font-medium cursor-pointer transition-colors ${
                      labelOptions.perRow === n
                        ? 'bg-[var(--color-brand)] text-white'
                        : 'bg-[var(--color-surface-muted)] text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {n} per row
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs text-slate-500 block mb-1.5">Sort / group by</label>
              <div className="flex gap-2">
                {(['look', 'productType'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setLabelOptions(o => ({ ...o, groupBy: g }))}
                    className={`flex-1 py-2 rounded-[var(--radius-md)] text-sm font-medium cursor-pointer transition-colors ${
                      labelOptions.groupBy === g
                        ? 'bg-[var(--color-brand)] text-white'
                        : 'bg-[var(--color-surface-muted)] text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {g === 'look' ? 'By Look' : 'By Type'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-slate-500 block mb-2">Fields to include</label>
              {[
                { key: 'showStyleNumber', label: 'Style Number' },
                { key: 'showDescription', label: 'Description' },
                { key: 'showLookNumber', label: 'Look Number' },
                { key: 'showQRValue', label: 'QR Value (text)' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 mb-1.5 cursor-pointer text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={(labelOptions as any)[key]}
                    onChange={e => setLabelOptions(o => ({ ...o, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" disabled={exporting} onClick={handleLabelExport}>
                {exporting ? 'Generating…' : `Export ${filtered.length} labels`}
              </Button>
              <Button variant="ghost" onClick={() => setShowLabelModal(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── SortableLookGroup ─────────────────────────────────────────────────────────

function SortableLookGroup({
  lookId, groupName, itemCount, gi, totalLookGroups, isDraggingAny,
  onMoveUp, onMoveDown, children,
}: {
  lookId: number
  groupName: string
  itemCount: number
  gi: number
  totalLookGroups: number
  isDraggingAny: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  children: React.ReactNode
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging, isOver,
  } = useSortable({ id: lookId })

  const isAnimating = !!(transform && (transform.x !== 0 || transform.y !== 0 || transform.scaleX !== 1 || transform.scaleY !== 1))

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={isOver && !isDragging ? 'border-t-2 border-[var(--color-accent)]' : 'border-t-2 border-transparent'}
    >
      {/* Group header */}
      <div
        className={`flex items-center bg-[var(--color-accent)]/10 border-b border-[var(--color-border)] text-xs font-bold text-[var(--color-accent)] select-none pr-1 ${isAnimating ? 'relative' : 'sticky top-0 z-10'}`}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className={`bg-transparent border-none min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0 rounded text-[var(--color-accent)]/60 hover:bg-[var(--color-accent)]/10 ${isDraggingAny ? 'cursor-grabbing' : 'cursor-grab'}`}
          aria-label={`Drag to reorder ${groupName}`}
          title="Drag to reorder"
        >
          <DotsSixVertical size={18} />
        </button>

        <span className="flex-1 py-2">
          {groupName} — {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>

        {/* Up/Down arrows */}
        <div className="flex gap-0.5 ml-1">
          <button
            disabled={gi === 0 || isDraggingAny}
            onClick={onMoveUp}
            className="px-2 py-2 text-xs border border-[var(--color-accent)]/30 rounded text-[var(--color-accent)] bg-white disabled:opacity-30 disabled:cursor-default cursor-pointer leading-tight hover:bg-[var(--color-accent)]/10 disabled:hover:bg-white min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Move up in shooting schedule"
          >
            <CaretUp size={10} />
          </button>
          <button
            disabled={gi === totalLookGroups - 1 || isDraggingAny}
            onClick={onMoveDown}
            className="px-2 py-2 text-xs border border-[var(--color-accent)]/30 rounded text-[var(--color-accent)] bg-white disabled:opacity-30 disabled:cursor-default cursor-pointer leading-tight hover:bg-[var(--color-accent)]/10 disabled:hover:bg-white min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Move down in shooting schedule"
          >
            <CaretDown size={10} />
          </button>
        </div>
      </div>

      {children}
    </div>
  )
}

// ── CustodyIcon ───────────────────────────────────────────────────────────────

function CustodyIcon({ location, faded }: { location: string; faded?: boolean }) {
  const cls = `inline-block flex-shrink-0 ${faded ? 'opacity-40' : 'opacity-80'}`
  if (location === 'at_client') return <Package size={12} className={cls} />
  if (location === 'in_transit') return <Truck size={12} className={cls} />
  if (location === 'at_studio') return <Storefront size={12} className={cls} />
  return null
}

// ── ShotRow ───────────────────────────────────────────────────────────────────

function ShotRow({ item, index, expanded, productTypes, locationFilter, onToggle, onAngleToggle, onShotStatusChange, onAssignProductType }: {
  item: StockItem
  index: number
  expanded: boolean
  productTypes: string[]
  locationFilter: string
  onToggle: () => void
  onAngleToggle: (angle: string) => void
  onShotStatusChange: (s: ShotStatus) => void
  onAssignProductType: (pt: string) => void
}) {
  const hasAngles = item.requiredAngles.length > 0
  const angleProgress = hasAngles ? `${item.completedAngles.length}/${item.requiredAngles.length}` : null
  const noAnglesWarning = !hasAngles && item.shotStatus !== 'notRequired'

  const statusPill = {
    shot:        { cls: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',  label: '✓ Shot' },
    notRequired: { cls: 'bg-slate-100 text-slate-400',                               label: 'N/A' },
    notShot:     { cls: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',  label: 'Not Shot' },
  }[item.shotStatus] ?? { cls: 'bg-slate-100 text-slate-400', label: item.shotStatus }

  const selectCls = 'w-full px-2 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm bg-white text-slate-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]'

  return (
    <div className={`border-b border-[var(--color-border)] ${index % 2 === 0 ? 'bg-white' : 'bg-[var(--color-surface-muted)]'}`}>
      {/* Row header */}
      <div className="flex items-center px-4 py-2.5 cursor-pointer gap-2" onClick={onToggle}>
        <span className="w-7 text-xs text-slate-400 text-center flex-shrink-0">{index + 1}</span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1.5">
            <CustodyIcon location={item.custodyLocation} faded={locationFilter === 'all'} />
            {item.styleNumber}
          </div>
          <div className="text-xs text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">
            {item.description || item.sku}
            {item.productType && <span className="text-[var(--color-info)] ml-1.5">· {item.productType}</span>}
          </div>
        </div>

        <div className="flex gap-1 flex-shrink-0">
          {item.looks.map(l => (
            <span key={l} className="text-[9px] font-bold bg-[var(--color-accent)]/10 text-[var(--color-accent)] px-1.5 py-0.5 rounded">
              L{l}
            </span>
          ))}
        </div>

        {angleProgress && (
          <span className="text-xs text-slate-500 flex-shrink-0">{angleProgress}</span>
        )}
        {noAnglesWarning && (
          <span className="text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-1.5 py-0.5 rounded flex-shrink-0">
            No angles
          </span>
        )}

        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${statusPill.cls}`}>
          {statusPill.label}
        </span>

        {expanded ? <CaretUp size={11} className="text-slate-300 flex-shrink-0" /> : <CaretDown size={11} className="text-slate-300 flex-shrink-0" />}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pl-14 pb-4 pt-3 bg-slate-50 border-t border-[var(--color-border)]">
          <div className="flex gap-4 flex-wrap">

            <div className="flex flex-col items-center gap-1">
              <QRCode value={item.qrCodeValue} size={90} />
              <span className="text-[9px] text-slate-400 font-mono max-w-[90px] overflow-hidden text-ellipsis whitespace-nowrap">
                {item.qrCodeValue}
              </span>
            </div>

            <div className="flex-1">
              {productTypes.length > 0 && (
                <div className="mb-2.5">
                  <label className="text-xs text-slate-400 block mb-1">Product type</label>
                  <select
                    value={item.productType ?? ''}
                    onChange={e => { e.stopPropagation(); onAssignProductType(e.target.value) }}
                    className={selectCls}
                  >
                    <option value="">— not assigned —</option>
                    {productTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                  </select>
                </div>
              )}

              {hasAngles ? (
                <div className="mb-2.5">
                  <p className="text-xs text-slate-400 mb-1.5">Tap angles to mark done:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.requiredAngles.map(angle => {
                      const done = item.completedAngles.includes(angle)
                      return (
                        <button
                          key={angle}
                          onClick={e => { e.stopPropagation(); onAngleToggle(angle) }}
                          className={`px-3 py-2 rounded-full text-sm font-semibold cursor-pointer border-none transition-colors min-h-[40px] ${
                            done
                              ? 'bg-[var(--color-accent)] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {done ? '✓ ' : ''}{angle}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mb-2.5">
                  {productTypes.length > 0
                    ? 'Assign a product type above to load required angles.'
                    : 'No required angles. Set up a client template to track angles.'}
                </p>
              )}

              <div className="flex gap-1.5">
                {(['notShot', 'shot', 'notRequired'] as const).map(s => (
                  <button
                    key={s}
                    onClick={e => { e.stopPropagation(); onShotStatusChange(s) }}
                    className={`px-2.5 py-2 rounded-[var(--radius-md)] text-xs font-medium cursor-pointer transition-colors min-h-[40px] ${
                      item.shotStatus === s
                        ? 'bg-[var(--color-brand)] text-white border-none'
                        : 'border border-[var(--color-border)] bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {s === 'notShot' ? 'Not Shot' : s === 'shot' ? '✓ Shot' : 'N/A'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
