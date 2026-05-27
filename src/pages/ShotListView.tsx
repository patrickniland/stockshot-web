// StockShot — Shot List View
// Full version: QR codes, angle tracking, look/product type grouping, label PDF export

import { useState } from 'react'
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

  const shoot = savedShoots.find(s => s.id === activeShootId) ?? null
  const allItems = shoot?.items ?? []

  // Only show items that have been formally scanned in (have custody history).
  // Unscanned imports default to with_client but shouldn't crowd the shot list.
  const scannedItems = allItems.filter(i => (i.custodyHistory ?? []).length > 0)

  // Location filter narrows within scanned items; 'all' shows all scanned
  const locationFiltered = shotListLocationFilter === 'all'
    ? scannedItems
    : scannedItems.filter(i => i.custodyLocation === shotListLocationFilter)

  // Get client product types for assignment
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

  async function handleLabelExport() {
    setExporting(true)
    try {
      await exportLabelGridPDF(filtered, labelOptions)
    } finally {
      setExporting(false)
      setShowLabelModal(false)
    }
  }

  // Group items
  const groups: Array<{ name: string; look?: number; items: StockItem[] }> = []
  if (groupBy === 'look') {
    const presentLooks = new Set(filtered.flatMap(i => i.looks))
    // Use lookOrder for display order; append any looks not yet in lookOrder
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
        ) : groups.map((group, gi) => (
          <div key={group.name}>
            {group.name && (
              <div style={{ padding: '8px 16px', background: '#EDE9FE', fontSize: '12px', fontWeight: 700, color: '#7B1FA2', borderBottom: '1px solid #E0E0E0', position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ flex: 1 }}>{group.name} — {group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                {groupBy === 'look' && group.look != null && (
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      disabled={gi === 0}
                      onClick={() => reorderLook(group.look!, groups[gi - 1].look!)}
                      style={{ padding: '1px 6px', fontSize: '11px', border: '1px solid #C9B8F5', borderRadius: '4px', background: gi > 0 ? '#fff' : 'transparent', color: gi > 0 ? '#7B1FA2' : '#C9B8F5', cursor: gi > 0 ? 'pointer' : 'default', lineHeight: 1.4 }}
                      title="Move up in shooting schedule"
                    >▲</button>
                    <button
                      disabled={gi === groups.length - 1}
                      onClick={() => reorderLook(group.look!, groups[gi + 1].look!)}
                      style={{ padding: '1px 6px', fontSize: '11px', border: '1px solid #C9B8F5', borderRadius: '4px', background: gi < groups.length - 1 ? '#fff' : 'transparent', color: gi < groups.length - 1 ? '#7B1FA2' : '#C9B8F5', cursor: gi < groups.length - 1 ? 'pointer' : 'default', lineHeight: 1.4 }}
                      title="Move down in shooting schedule"
                    >▼</button>
                  </div>
                )}
              </div>
            )}
            {group.items.map((item, i) => (
              <ShotRow
                key={item.id}
                item={item}
                index={i}
                expanded={expandedId === item.id}
                productTypes={productTypes.map(p => p.name)}
                locationFilter={shotListLocationFilter}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onAngleToggle={angle => storeToggleAngle(item.id, angle)}
                onShotStatusChange={s => {
                  const now = new Date().toISOString()
                  storeUpdateItem(item.id, {
                    shotStatus: s,
                    shotAt: s === 'shot' ? now : null,
                    completedAngles: s === 'shot' ? item.requiredAngles : [],
                  })
                }}
                onAssignProductType={pt => assignProductType(item.id, pt)}
              />
            ))}
          </div>
        ))}
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

        {/* Look badges */}
        <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
          {item.looks.map(l => (
            <span key={l} style={{ fontSize: '9px', fontWeight: 700, background: '#EDE9FE', color: '#7B1FA2', padding: '2px 5px', borderRadius: '3px' }}>
              L{l}
            </span>
          ))}
        </div>

        {/* Angle progress or warning */}
        {angleProgress && (
          <span style={{ fontSize: '11px', color: '#666', flexShrink: 0 }}>{angleProgress}</span>
        )}
        {noAnglesWarning && (
          <span style={{ fontSize: '10px', color: '#E65100', background: '#FFF3E0', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
            No angles
          </span>
        )}

        {/* Shot status */}
        <div style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', background: shotBg, color: shotColor, flexShrink: 0 }}>
          {item.shotStatus === 'shot' ? '✓ Shot' : item.shotStatus === 'notRequired' ? 'N/A' : 'Not Shot'}
        </div>

        <span style={{ fontSize: '11px', color: '#ccc', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ padding: '12px 16px 16px 52px', background: '#F8F8F8', borderTop: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

            {/* QR Code */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <QRCode value={item.qrCodeValue} size={90} />
              <span style={{ fontSize: '9px', color: '#888', fontFamily: 'monospace', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.qrCodeValue}
              </span>
            </div>

            <div style={{ flex: 1 }}>
              {/* Product type assignment */}
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

              {/* Angle pills */}
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

              {/* Shot status override */}
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
