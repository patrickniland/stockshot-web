// StockShot — Shot List View
// Full version: QR codes, angle tracking, look/product type grouping, label PDF export

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
import useAppStore from '../store/useAppStore'
import { useNavSync } from '../hooks/useNavSync'
import { StockItem, ShotStatus } from '../types'
import { exportShotListCSV } from '../lib/csvExport'
import { exportShotListPDF, exportLabelGridPDF, LabelOptions } from '../lib/pdfExporter'
import QRCode from '../components/QRCode'
import LookBuilder from '../components/LookBuilder'

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
      await exportLabelGridPDF(filtered, labelOptions)
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

  // ── Shot row callbacks (shared between sortable and non-sortable paths) ─────

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
      <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
        <p style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</p>
        <p style={{ fontWeight: 500 }}>No active shoot</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Location filter bar */}
      <div style={{ padding: '8px 16px', background: '#fff', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#666', marginRight: '2px' }}>Location:</span>
        {([
          { value: 'all',        label: 'All' },
          { value: 'at_studio',  label: '🏠 At Studio' },
          { value: 'at_client',  label: '📦 At Client' },
          { value: 'in_transit', label: '🚚 In Transit' },
        ] as const).map(opt => (
          <button key={opt.value} onClick={() => setShotListLocationFilter(opt.value)} style={{
            padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
            border: `1.5px solid ${shotListLocationFilter === opt.value ? '#1565C0' : '#E0E0E0'}`,
            background: shotListLocationFilter === opt.value ? '#E3F2FD' : '#F9F9F9',
            color: shotListLocationFilter === opt.value ? '#1565C0' : '#666',
            cursor: 'pointer',
          }}>
            {opt.label}
          </button>
        ))}
        <span style={{ fontSize: '11px', color: '#999', marginLeft: 'auto' }}>{scannedItems.length} scanned / {allItems.length} total</span>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: '#F5F5F5', borderBottom: '1px solid #E0E0E0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>Shot List</span>
        <span style={{ fontSize: '13px', color: '#666' }}>({filtered.length} items)</span>
        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #E0E0E0', borderRadius: '7px', padding: '5px 10px' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." style={{ border: 'none', outline: 'none', fontSize: '12px', width: '120px' }} />
        </div>

        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="all">All</option>
          <option value="notShot">Not Shot</option>
          <option value="partial">Partial</option>
          <option value="shot">Shot</option>
        </select>

        <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
          style={{ padding: '6px 8px', border: '1px solid #E0E0E0', borderRadius: '7px', fontSize: '12px' }}>
          <option value="look">Group by Look</option>
          <option value="productType">Group by Type</option>
          <option value="none">No Grouping</option>
        </select>

        <button onClick={() => exportShotListCSV(filtered)} style={{ padding: '6px 10px', background: '#F5F5F5', border: '1px solid #E0E0E0', color: '#444', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>XLS</button>
        <button onClick={() => setShowListPdfModal(true)} style={{ padding: '6px 10px', background: '#424242', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>List PDF</button>
        <button onClick={() => setShowLabelModal(true)} style={{ padding: '6px 10px', background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>🏷 Labels PDF</button>
        <button onClick={() => setShowLookBuilder(true)} style={{ padding: '6px 10px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>👁 Look Builder</button>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#888', fontSize: '13px' }}>
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
                  <div style={{
                    padding: '8px 12px 8px 6px',
                    background: '#D1C4E9',
                    borderRadius: '6px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    fontSize: '12px', fontWeight: 700, color: '#7B1FA2',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    cursor: 'grabbing',
                    userSelect: 'none',
                    border: '2px solid #9575CD',
                  }}>
                    <span style={{ fontSize: '18px', opacity: 0.7, minWidth: '44px', textAlign: 'center' }}>≡</span>
                    Look {dragActiveId}
                    <span style={{ opacity: 0.6, fontWeight: 400 }}>
                      · {lookGroups.find(g => g.look === dragActiveId)?.items.length ?? 0} items
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {/* No Look Assigned — not sortable, always at bottom */}
            {noLookGroup && (
              <div>
                <div style={{ padding: '8px 16px', background: '#EDE9FE', fontSize: '12px', fontWeight: 700, color: '#7B1FA2', borderBottom: '1px solid #E0E0E0', position: 'sticky', top: 0, zIndex: 1 }}>
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
                <div style={{ padding: '8px 16px', background: '#EDE9FE', fontSize: '12px', fontWeight: 700, color: '#7B1FA2', borderBottom: '1px solid #E0E0E0', position: 'sticky', top: 0, zIndex: 1 }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '340px', maxWidth: '90vw' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem', color: '#111' }}>List PDF Options</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', cursor: 'pointer', fontSize: '13px', color: '#444' }}>
              <input type="checkbox" checked={listPdfIncludeLocation} onChange={e => setListPdfIncludeLocation(e.target.checked)} />
              Include Location column
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={async () => {
                  setExporting(true)
                  try { await exportShotListPDF(filtered, groupBy === 'none' ? 'look' : groupBy, listPdfIncludeLocation) }
                  finally { setExporting(false); setShowListPdfModal(false) }
                }}
                disabled={exporting}
                style={{ flex: 1, padding: '10px', background: exporting ? '#E0E0E0' : '#424242', color: exporting ? '#999' : '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: exporting ? 'default' : 'pointer' }}
              >
                {exporting ? 'Generating...' : `Export ${filtered.length} items`}
              </button>
              <button onClick={() => setShowListPdfModal(false)} style={{ padding: '10px 16px', background: '#F5F5F5', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Label export modal */}
      {showLabelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem', width: '400px', maxWidth: '90vw' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '1rem', color: '#111' }}>🏷 Label Grid PDF</h2>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '6px' }}>Labels per row</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {([4, 8] as const).map(n => (
                  <button key={n} onClick={() => setLabelOptions(o => ({ ...o, perRow: n }))} style={{
                    flex: 1, padding: '8px', borderRadius: '7px', fontSize: '13px',
                    fontWeight: 500, cursor: 'pointer', border: 'none',
                    background: labelOptions.perRow === n ? '#1C1C1E' : '#F5F5F5',
                    color: labelOptions.perRow === n ? '#fff' : '#444',
                  }}>
                    {n} per row
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '6px' }}>Sort / group by</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['look', 'productType'] as const).map(g => (
                  <button key={g} onClick={() => setLabelOptions(o => ({ ...o, groupBy: g }))} style={{
                    flex: 1, padding: '8px', borderRadius: '7px', fontSize: '12px',
                    fontWeight: 500, cursor: 'pointer', border: 'none',
                    background: labelOptions.groupBy === g ? '#1C1C1E' : '#F5F5F5',
                    color: labelOptions.groupBy === g ? '#fff' : '#444',
                  }}>
                    {g === 'look' ? 'By Look' : 'By Type'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '8px' }}>Fields to include</label>
              {[
                { key: 'showStyleNumber', label: 'Style Number' },
                { key: 'showDescription', label: 'Description' },
                { key: 'showLookNumber', label: 'Look Number' },
                { key: 'showQRValue', label: 'QR Value (text)' },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', fontSize: '13px', color: '#444' }}>
                  <input type="checkbox"
                    checked={(labelOptions as any)[key]}
                    onChange={e => setLabelOptions(o => ({ ...o, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleLabelExport} disabled={exporting} style={{
                flex: 1, padding: '10px', background: exporting ? '#E0E0E0' : '#7B1FA2',
                color: exporting ? '#999' : '#fff', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, cursor: exporting ? 'default' : 'pointer',
              }}>
                {exporting ? 'Generating...' : `Export ${filtered.length} labels`}
              </button>
              <button onClick={() => setShowLabelModal(false)} style={{
                padding: '10px 16px', background: '#F5F5F5', border: 'none',
                borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444',
              }}>
                Cancel
              </button>
            </div>
          </div>
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

  // When transform is non-null the element is being moved by dnd-kit.
  // position:sticky breaks under CSS transform, so switch to relative while animated.
  const isAnimating = !!(transform && (transform.x !== 0 || transform.y !== 0 || transform.scaleX !== 1 || transform.scaleY !== 1))

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        // Drop target indicator — 2px line at the top of the hovered row
        borderTop: isOver && !isDragging ? '2px solid #7B1FA2' : '2px solid transparent',
      }}
    >
      {/* Group header */}
      <div style={{
        padding: '0 4px 0 0',
        background: '#EDE9FE',
        fontSize: '12px', fontWeight: 700, color: '#7B1FA2',
        borderBottom: '1px solid #E0E0E0',
        position: isAnimating ? 'relative' : 'sticky',
        top: 0, zIndex: isAnimating ? 0 : 1,
        display: 'flex', alignItems: 'center',
        userSelect: 'none',
      }}>
        {/* Drag handle — primary affordance, full 44×44 touch target */}
        <button
          {...attributes}
          {...listeners}
          style={{
            background: 'none', border: 'none',
            cursor: isDraggingAny ? 'grabbing' : 'grab',
            color: '#9575CD',
            fontSize: '18px',
            minWidth: '44px', minHeight: '44px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            borderRadius: '4px',
            lineHeight: 1,
          }}
          aria-label={`Drag to reorder ${groupName}`}
          title="Drag to reorder"
        >
          ≡
        </button>

        <span style={{ flex: 1, padding: '8px 0' }}>
          {groupName} — {itemCount} item{itemCount !== 1 ? 's' : ''}
        </span>

        {/* Up/Down arrows — secondary affordance, muted styling */}
        <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
          <button
            disabled={gi === 0 || isDraggingAny}
            onClick={onMoveUp}
            style={{
              padding: '1px 6px', fontSize: '11px',
              border: '1px solid #C9B8F5', borderRadius: '4px',
              background: gi > 0 && !isDraggingAny ? '#fff' : 'transparent',
              color: gi > 0 && !isDraggingAny ? '#7B1FA2' : '#C9B8F5',
              cursor: gi > 0 && !isDraggingAny ? 'pointer' : 'default',
              lineHeight: 1.4,
            }}
            title="Move up in shooting schedule"
          >▲</button>
          <button
            disabled={gi === totalLookGroups - 1 || isDraggingAny}
            onClick={onMoveDown}
            style={{
              padding: '1px 6px', fontSize: '11px',
              border: '1px solid #C9B8F5', borderRadius: '4px',
              background: gi < totalLookGroups - 1 && !isDraggingAny ? '#fff' : 'transparent',
              color: gi < totalLookGroups - 1 && !isDraggingAny ? '#7B1FA2' : '#C9B8F5',
              cursor: gi < totalLookGroups - 1 && !isDraggingAny ? 'pointer' : 'default',
              lineHeight: 1.4,
            }}
            title="Move down in shooting schedule"
          >▼</button>
        </div>
      </div>

      {children}
    </div>
  )
}

// ── ShotRow ───────────────────────────────────────────────────────────────────

const CUSTODY_ICON: Record<string, string> = {
  at_client:  '📦',
  in_transit: '🚚',
  at_studio:  '🏠',
}

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
  const shotBg = item.shotStatus === 'shot' ? '#EDE9FE' : item.shotStatus === 'notRequired' ? '#F5F5F5' : '#FFF3E0'
  const shotColor = item.shotStatus === 'shot' ? '#7B1FA2' : item.shotStatus === 'notRequired' ? '#999' : '#E65100'
  const angleProgress = hasAngles ? `${item.completedAngles.length}/${item.requiredAngles.length}` : null
  const noAnglesWarning = !hasAngles && item.shotStatus !== 'notRequired'

  return (
    <div style={{ borderBottom: '1px solid #F0F0F0', background: index % 2 === 0 ? '#fff' : '#FAFAFA' }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', gap: '8px' }} onClick={onToggle}>
        <span style={{ width: '28px', fontSize: '11px', color: '#999', textAlign: 'center', flexShrink: 0 }}>{index + 1}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', opacity: locationFilter === 'all' ? 0.4 : 0.9, flexShrink: 0 }}>
              {CUSTODY_ICON[item.custodyLocation] ?? ''}
            </span>
            {item.styleNumber}
          </div>
          <div style={{ fontSize: '10px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.description || item.sku}
            {item.productType && <span style={{ color: '#1565C0', marginLeft: '6px' }}>· {item.productType}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {item.looks.map(l => (
            <span key={l} style={{ fontSize: '9px', fontWeight: 700, background: '#EDE9FE', color: '#7B1FA2', padding: '2px 5px', borderRadius: '3px' }}>
              L{l}
            </span>
          ))}
        </div>

        {angleProgress && (
          <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>{angleProgress}</span>
        )}
        {noAnglesWarning && (
          <span style={{ fontSize: '10px', color: '#E65100', background: '#FFF3E0', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
            No angles
          </span>
        )}

        <div style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', background: shotBg, color: shotColor, flexShrink: 0 }}>
          {item.shotStatus === 'shot' ? '✓ Shot' : item.shotStatus === 'notRequired' ? 'N/A' : 'Not Shot'}
        </div>

        <span style={{ fontSize: '11px', color: '#ccc', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ padding: '12px 16px 16px 52px', background: '#F8F8F8', borderTop: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <QRCode value={item.qrCodeValue} size={90} />
              <span style={{ fontSize: '9px', color: '#888', fontFamily: 'monospace', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.qrCodeValue}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              {productTypes.length > 0 && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px' }}>Product type</label>
                  <select
                    value={item.productType ?? ''}
                    onChange={e => { e.stopPropagation(); onAssignProductType(e.target.value) }}
                    style={{ padding: '5px 8px', border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '12px', width: '100%' }}
                  >
                    <option value="">— not assigned —</option>
                    {productTypes.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                  </select>
                </div>
              )}

              {hasAngles ? (
                <div style={{ marginBottom: '10px' }}>
                  <p style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>Tap angles to mark done:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {item.requiredAngles.map(angle => {
                      const done = item.completedAngles.includes(angle)
                      return (
                        <button key={angle} onClick={(e) => { e.stopPropagation(); onAngleToggle(angle) }} style={{
                          padding: '5px 12px', borderRadius: '99px', fontSize: '12px',
                          fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: done ? '#7B1FA2' : '#F0F0F0',
                          color: done ? '#fff' : '#666',
                          transition: 'all 0.15s',
                        }}>
                          {done ? '✓ ' : ''}{angle}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>
                  {productTypes.length > 0
                    ? 'Assign a product type above to load required angles.'
                    : 'No required angles. Set up a client template to track angles.'}
                </p>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                {(['notShot', 'shot', 'notRequired'] as const).map(s => (
                  <button key={s} onClick={(e) => { e.stopPropagation(); onShotStatusChange(s) }} style={{
                    padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                    fontWeight: 500, cursor: 'pointer',
                    border: item.shotStatus === s ? 'none' : '1px solid #E0E0E0',
                    background: item.shotStatus === s ? '#1C1C1E' : '#fff',
                    color: item.shotStatus === s ? '#fff' : '#444',
                  }}>
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
