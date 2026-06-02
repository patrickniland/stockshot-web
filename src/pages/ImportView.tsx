// StockShot — Import View

import { useState, useRef } from 'react'
import { FolderOpen, FileText, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { useNavSync } from '../hooks/useNavSync'
import { v4 as uuidv4 } from 'uuid'
import { parseFileToRows, previewHeaders, importFromRows } from '../lib/importCoordinator'
import { ColumnMapping, defaultColumnMapping } from '../types'
import useAppStore from '../store/useAppStore'
import { upsertItems, upsertShootMeta } from '../lib/db'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function ImportView() {
  useNavSync({ onEnter: 'pull' })
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
    console.log('[Import] handleImport — orgId:', orgId, '| target:', importTarget, '| items:', result.items.length)

    if (importTarget === 'existing') {
      const activeShoot = getActiveShoot()
      if (activeShoot) {
        addDropToActiveShoot(drop, result.items)
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
        isUnassigned: false,
      }
      addShoot(newShoot)
      if (orgId) {
        upsertShootMeta(newShoot, orgId)
          .then(() => upsertItems(result.items, newShootId, orgId))
          .catch(e => console.error('[Import] save error — code:', e?.code, '| message:', e?.message, '| details:', e?.details))
      } else {
        console.warn('[Import] skipping Supabase save — orgId is null')
      }
    }

    setSuccess(`${result.items.length} items imported successfully!`)
    setStep('upload'); setRows([]); setHeaders([]); setFilename('')
    setTimeout(() => setSuccess(null), 4000)
  }

  const dataRowCount = rows.length - (mapping.hasHeaderRow ? 1 : 0)
  const activeShoot = getActiveShoot()

  return (
    <div className="p-8 max-w-[820px]">
      <h1 className="text-[22px] font-semibold text-neutral-900 mb-1">Import Stock</h1>
      <p className="text-[13px] text-neutral-500 mb-6">
        Upload an XLSX or CSV file to create or add to a shoot.
      </p>

      {success && (
        <div className="flex items-center gap-2 bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 rounded-[var(--radius-md)] px-4 py-3 mb-4 text-[13px] text-[var(--color-success)]">
          <CheckCircle size={16} weight="fill" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-[var(--radius-md)] px-4 py-3 mb-4 text-[13px] text-[var(--color-danger)]">
          <XCircle size={16} weight="fill" />
          {error}
        </div>
      )}

      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-[var(--radius-lg)] p-12 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-[var(--color-info)] bg-[var(--color-info)]/10'
              : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
          }`}
        >
          <FolderOpen size={48} weight="duotone" className="mx-auto mb-3 text-neutral-400" />
          <p className="text-[15px] font-medium text-neutral-900 mb-1.5">
            Drop your XLSX or CSV file here
          </p>
          <p className="text-[12px] text-neutral-400">or click to browse</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {loading && <p className="mt-4 text-[13px] text-neutral-500">Parsing file...</p>}
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col gap-4">
          {/* File info */}
          <div className="flex items-center gap-2 bg-[var(--color-info)]/10 border border-[var(--color-info)]/30 rounded-[var(--radius-md)] px-4 py-3 text-[13px] text-[var(--color-info)]">
            <FileText size={16} weight="fill" />
            {filename} — {dataRowCount} data rows detected
          </div>

          {/* Import target */}
          <Card padding="md">
            <p className="text-[13px] font-semibold text-neutral-900 mb-3">Import as</p>
            <div className="flex gap-2.5 mb-3">
              <button
                onClick={() => setImportTarget('new')}
                className={`flex-1 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium cursor-pointer border-none transition-colors ${
                  importTarget === 'new'
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'bg-[var(--color-surface-muted)] text-neutral-700'
                }`}
              >
                New Shoot
              </button>
              <button
                onClick={() => setImportTarget('existing')}
                disabled={!activeShoot}
                className={`flex-1 py-2.5 rounded-[var(--radius-md)] text-[13px] font-medium border-none transition-colors ${
                  !activeShoot
                    ? 'bg-[var(--color-surface-muted)] text-neutral-300 cursor-default'
                    : importTarget === 'existing'
                    ? 'bg-[var(--color-info)] text-white cursor-pointer'
                    : 'bg-[var(--color-surface-muted)] text-neutral-700 cursor-pointer'
                }`}
              >
                Add to "{activeShoot?.name ?? 'no active shoot'}"
              </button>
            </div>

            {importTarget === 'new' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[11px] text-neutral-500 block mb-1">Shoot name</label>
                  <input
                    value={shootName}
                    onChange={e => setShootName(e.target.value)}
                    placeholder="e.g. Summer 2026"
                    className="w-full px-2 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] box-border"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-neutral-500 block mb-1">Client (optional)</label>
                  <select
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full px-2 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] bg-white box-border"
                  >
                    <option value="">— no client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Drop / batch name</label>
              <input
                value={dropName}
                onChange={e => setDropName(e.target.value)}
                placeholder="e.g. Drop 1"
                className="w-full px-2 py-2 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[13px] box-border"
              />
            </div>
          </Card>

          {/* Import mode */}
          <Card padding="md">
            <p className="text-[13px] font-semibold text-neutral-900 mb-2.5">Import mode</p>
            <div className="flex gap-2.5">
              {(['jobList', 'mappingReference'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setImportMode(mode)}
                  className={`px-4 py-2 rounded-[var(--radius-md)] text-[12px] font-medium cursor-pointer border-none transition-colors ${
                    importMode === mode
                      ? 'bg-[var(--color-brand)] text-white'
                      : 'bg-[var(--color-surface-muted)] text-neutral-700'
                  }`}
                >
                  {mode === 'jobList' ? 'Job List' : 'Mapping Reference'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 mt-2">
              {importMode === 'jobList'
                ? 'Every row is an expected item. Missing items are tracked.'
                : 'Reference catalogue only. Scan items freely without tracking missing ones.'}
            </p>
          </Card>

          {/* Column mapping */}
          <Card padding="md">
            <p className="text-[13px] font-semibold text-neutral-900 mb-1">Column mapping</p>
            <p className="text-[11px] text-neutral-400 mb-3">Map your file columns to StockShot fields.</p>

            <label className="text-[12px] text-neutral-600 flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={mapping.hasHeaderRow}
                onChange={e => setMapping(m => ({ ...m, hasHeaderRow: e.target.checked }))}
              />
              First row is a header
            </label>

            {[
              { label: 'Style Number *', key: 'styleNumberColumn', nullable: false },
              { label: 'SKU *', key: 'skuColumn', nullable: false },
              { label: 'QR Source', key: 'qrSourceColumn', nullable: false },
              { label: 'Description', key: 'descriptionColumn', nullable: true },
              { label: 'Product Type', key: 'productTypeColumn', nullable: true },
            ].map(({ label, key, nullable }) => (
              <div key={key} className="flex items-center gap-3 mb-2.5">
                <span className="text-[12px] w-32 text-neutral-600 shrink-0">{label}</span>
                <select
                  value={nullable ? ((mapping as any)[key] ?? '') : (mapping as any)[key]}
                  onChange={e => {
                    const val = e.target.value === '' ? null : parseInt(e.target.value)
                    setMapping(m => ({ ...m, [key]: val }))
                  }}
                  className="px-2 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-[12px] flex-1 bg-white"
                >
                  {nullable && <option value="">— not mapped —</option>}
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </Card>

          {/* Preview */}
          {rows.length > 0 && (
            <Card padding="md" className="overflow-x-auto">
              <p className="text-[13px] font-semibold text-neutral-900 mb-3">Preview (first 5 rows)</p>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 bg-[var(--color-surface-muted)] text-left border-b border-[var(--color-border)] text-neutral-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1, 6).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-2 py-1.5 border-b border-[var(--color-border)]/50 text-neutral-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-[var(--radius-md)] px-4 py-2.5 text-[12px] text-[var(--color-warning)]">
              <Warning size={14} weight="fill" />
              {w}
            </div>
          ))}

          <div className="flex gap-2.5 mt-2">
            <Button variant="primary" size="md" onClick={handleImport}>
              Import {dataRowCount} items
            </Button>
            <Button variant="secondary" size="md" onClick={() => { setStep('upload'); setRows([]); setHeaders([]) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
