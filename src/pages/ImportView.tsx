// StockShot — Import View (fixed)

import { useState, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { parseFileToRows, previewHeaders, importFromRows } from '../lib/importCoordinator'
import { ColumnMapping, defaultColumnMapping } from '../types'
import useAppStore from '../store/useAppStore'
import { upsertItems, upsertShootMeta } from '../lib/db'

export default function ImportView() {
  const [rows, setRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(defaultColumnMapping)
  const [importMode, setImportMode] = useState<'jobList' | 'mappingReference'>('jobList')
  const [dropName, setDropName] = useState('')
  const [shootName, setShootName] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [importTarget, setImportTarget] = useState<'new' | 'existing'>('new')
  const [filename, setFilename] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'upload' | 'map'>('upload')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { addShoot, getActiveShoot, addDropToActiveShoot, clients, getClient, savedShoots } = useAppStore()

  async function handleFile(file: File) {
    setError(null); setLoading(true)
    try {
      const parsed = await parseFileToRows(file)
      setRows(parsed)
      setHeaders(previewHeaders(parsed))
      setFilename(file.name)
      setDropName(file.name.replace(/\.[^/.]+$/, ''))
      setStep('map')
    } catch (e: any) {
      setError(e.message || 'Failed to parse file')
    }
    setLoading(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleImport() {
    setError(null)
    const client = getClient(selectedClientId || null)
    const dropId = uuidv4()
    const result = importFromRows(rows, mapping, dropId, client)

    if (result.errorMessage) { setError(result.errorMessage); return }
    setWarnings(result.warnings)

    const drop = {
      id: dropId,
      name: dropName || filename,
      importedAt: new Date().toISOString(),
      sourceFilename: filename,
      importMode,
      columnMapping: mapping,
      itemCount: result.items.length,
    }

    const orgId = useAppStore.getState().orgId

    if (importTarget === 'existing') {
      const activeShoot = getActiveShoot()
      if (activeShoot) {
        addDropToActiveShoot(drop, result.items)
        // Save items to Supabase
        if (orgId) {
          upsertItems(result.items, activeShoot.id, orgId)
            .catch(e => console.error('[Import] items save error:', e))
        }
      } else {
        setError('No active shoot to add to. Please create a new shoot instead.')
        return
      }
    } else {
      const newShootId = uuidv4()
      const newShoot = {
        id: newShootId,
        name: shootName || `Shoot ${new Date().toLocaleDateString()}`,
        clientId: selectedClientId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: result.items,
        drops: [drop],
        lookOrder: [],
        deletedAt: null,
      }
      addShoot(newShoot)
      // Save shoot meta and items to Supabase
      if (orgId) {
        upsertShootMeta(newShoot, orgId)
          .then(() => upsertItems(result.items, newShootId, orgId))
          .catch(e => console.error('[Import] shoot/items save error:', e))
      }
    }

    setSuccess(`${result.items.length} items imported successfully!`)
    setStep('upload'); setRows([]); setHeaders([]); setFilename('')
    setTimeout(() => setSuccess(null), 4000)
  }

  const dataRowCount = rows.length - (mapping.hasHeaderRow ? 1 : 0)
  const activeShoot = getActiveShoot()

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #E0E0E0',
    borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem',
  }
  const label11: React.CSSProperties = { fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }
  const input: React.CSSProperties = {
    width: '100%', padding: '8px', border: '1px solid #E0E0E0',
    borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box',
  }
  const select: React.CSSProperties = {
    padding: '6px 8px', border: '1px solid #E0E0E0',
    borderRadius: '6px', fontSize: '12px', flex: 1,
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '820px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '4px', color: '#111' }}>Import Stock</h1>
      <p style={{ color: '#666', fontSize: '13px', marginBottom: '1.5rem' }}>
        Upload an XLSX or CSV file to create or add to a shoot.
      </p>

      {success && (
        <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: '8px', padding: '12px 16px', marginBottom: '1rem', color: '#2E7D32', fontSize: '13px' }}>
          ✓ {success}
        </div>
      )}
      {error && (
        <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: '8px', padding: '12px 16px', marginBottom: '1rem', color: '#B71C1C', fontSize: '13px' }}>
          ✗ {error}
        </div>
      )}

      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#1565C0' : '#E0E0E0'}`,
            borderRadius: '12px', padding: '3rem', textAlign: 'center',
            cursor: 'pointer', background: dragOver ? '#E3F2FD' : '#FAFAFA',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <p style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px', color: '#111' }}>
            Drop your XLSX or CSV file here
          </p>
          <p style={{ fontSize: '12px', color: '#888' }}>or click to browse</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {loading && <p style={{ marginTop: '1rem', color: '#666' }}>Parsing file...</p>}
        </div>
      )}

      {step === 'map' && (
        <div>
          <div style={{ background: '#E3F2FD', borderRadius: '8px', padding: '12px 16px', marginBottom: '1.5rem', fontSize: '13px', color: '#1565C0' }}>
            📄 {filename} — {dataRowCount} data rows detected
          </div>

          {/* Import target — NEW key addition */}
          <div style={card}>
            <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px', color: '#111' }}>Import as</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button onClick={() => setImportTarget('new')} style={{
                flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px',
                fontWeight: 500, cursor: 'pointer', border: 'none',
                background: importTarget === 'new' ? '#1C1C1E' : '#F5F5F5',
                color: importTarget === 'new' ? '#fff' : '#444',
              }}>
                🆕 New Shoot
              </button>
              <button
                onClick={() => setImportTarget('existing')}
                disabled={!activeShoot}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px',
                  fontWeight: 500, cursor: activeShoot ? 'pointer' : 'default', border: 'none',
                  background: importTarget === 'existing' ? '#1565C0' : '#F5F5F5',
                  color: importTarget === 'existing' ? '#fff' : activeShoot ? '#444' : '#ccc',
                }}>
                ➕ Add to "{activeShoot?.name ?? 'no active shoot'}"
              </button>
            </div>

            {importTarget === 'new' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={label11}>Shoot name</label>
                  <input value={shootName} onChange={e => setShootName(e.target.value)}
                    placeholder="e.g. Summer 2026" style={input} />
                </div>
                <div>
                  <label style={label11}>Client (optional)</label>
                  <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} style={{ ...input }}>
                    <option value="">— no client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label style={label11}>Drop / batch name</label>
              <input value={dropName} onChange={e => setDropName(e.target.value)}
                placeholder="e.g. Drop 1" style={input} />
            </div>
          </div>

          {/* Import mode */}
          <div style={card}>
            <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: '#111' }}>Import mode</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(['jobList', 'mappingReference'] as const).map(mode => (
                <button key={mode} onClick={() => setImportMode(mode)} style={{
                  padding: '8px 16px', borderRadius: '7px', fontSize: '12px',
                  fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: importMode === mode ? '#1C1C1E' : '#F5F5F5',
                  color: importMode === mode ? '#fff' : '#444',
                }}>
                  {mode === 'jobList' ? '📋 Job List' : '📚 Mapping Reference'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
              {importMode === 'jobList'
                ? 'Every row is an expected item. Missing items are tracked.'
                : 'Reference catalogue only. Scan items freely without tracking missing ones.'}
            </p>
          </div>

          {/* Column mapping */}
          <div style={card}>
            <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', color: '#111' }}>Column mapping</p>
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>Map your file columns to StockShot fields.</p>

            <label style={{ fontSize: '12px', color: '#444', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input type="checkbox" checked={mapping.hasHeaderRow}
                onChange={e => setMapping(m => ({ ...m, hasHeaderRow: e.target.checked }))} />
              First row is a header
            </label>

            {[
              { label: 'Style Number *', key: 'styleNumberColumn', nullable: false },
              { label: 'SKU *', key: 'skuColumn', nullable: false },
              { label: 'QR Source', key: 'qrSourceColumn', nullable: false },
              { label: 'Description', key: 'descriptionColumn', nullable: true },
              { label: 'Product Type', key: 'productTypeColumn', nullable: true },
            ].map(({ label, key, nullable }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', width: '130px', color: '#444', flexShrink: 0 }}>{label}</span>
                <select
                  value={nullable ? ((mapping as any)[key] ?? '') : (mapping as any)[key]}
                  onChange={e => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value)
                    setMapping(m => ({ ...m, [key]: val }))
                  }}
                  style={select}
                >
                  {nullable && <option value="">— not mapped —</option>}
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Preview */}
          {rows.length > 0 && (
            <div style={{ ...card, overflowX: 'auto' }}>
              <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '12px', color: '#111' }}>Preview (first 5 rows)</p>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{headers.map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', background: '#F5F5F5', textAlign: 'left', borderBottom: '1px solid #E0E0E0', color: '#444' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(1, 6).map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '6px 8px', borderBottom: '1px solid #F5F5F5', color: '#555' }}>{cell}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {warnings.map((w, i) => (
            <div key={i} style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', fontSize: '12px', color: '#F57F17' }}>
              ⚠ {w}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
            <button onClick={handleImport} style={{
              padding: '10px 24px', background: '#1C1C1E', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: 500, cursor: 'pointer',
            }}>
              Import {dataRowCount} items
            </button>
            <button onClick={() => { setStep('upload'); setRows([]); setHeaders([]) }} style={{
              padding: '10px 16px', background: '#F5F5F5', color: '#444',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
