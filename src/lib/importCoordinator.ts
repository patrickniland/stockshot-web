// StockShot — Import Coordinator
// Unified entry point for CSV and XLSX parsing
// Forward-planned: supports product type column, angle inheritance from client templates

import { ColumnMapping, ImportResult, StockItem, Client } from '../types'
import { v4 as uuidv4 } from 'uuid'

// ── File parsing ─────────────────────────────────────────────────────────────

export async function parseFileToRows(file: File): Promise<string[][]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xls') return parseXLSX(file)
  if (ext === 'csv' || ext === 'txt') return parseCSV(file)
  throw new Error('Unsupported file type. Please use .xlsx or .csv')
}

async function parseCSV(file: File): Promise<string[][]> {
  const Papa = (await import('papaparse')).default
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (r) => resolve(r.data as string[][]),
      error: (e: Error) => reject(e),
      skipEmptyLines: true,
    })
  })
}

async function parseXLSX(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// ── Header preview ───────────────────────────────────────────────────────────

export function previewHeaders(rows: string[][]): string[] {
  if (!rows.length) return []
  return rows[0].map((v, i) => (v?.toString().trim() || `Col ${i + 1}`))
}

// ── Product type auto-mapping ─────────────────────────────────────────────────

function resolveProductType(value: string, client: Client | null): string | null {
  if (!client) return value.trim() || null
  const v = value.trim().toLowerCase()
  for (const pt of client.productTypes) {
    if (pt.name.toLowerCase() === v) return pt.name
    if (pt.aliases.some(a => a.toLowerCase() === v)) return pt.name
  }
  return value.trim() || null
}

function getRequiredAngles(productType: string | null, client: Client | null): string[] {
  if (!client || !productType) return []
  const pt = client.productTypes.find(p => p.name === productType)
  return pt?.requiredAngles.map(a => a.name) ?? []
}

// ── Main import ───────────────────────────────────────────────────────────────

export function importFromRows(
  rows: string[][],
  mapping: ColumnMapping,
  dropId?: string,
  client?: Client | null
): ImportResult {
  const dataRows = mapping.hasHeaderRow ? rows.slice(1) : rows
  const headers = previewHeaders(rows)
  const items: StockItem[] = []
  const warnings: string[] = []

  for (const row of dataRows) {
    const trimmed = row.map(c => c?.toString().trim() ?? '')
    if (!trimmed.some(c => c)) continue

    const styleNumber = safe(trimmed, mapping.styleNumberColumn)
    const sku = safe(trimmed, mapping.skuColumn)
    if (!styleNumber && !sku) continue

    const description = mapping.descriptionColumn != null
      ? safe(trimmed, mapping.descriptionColumn) : ''

    const qrCodeValue = safe(trimmed, mapping.qrSourceColumn) || sku

    // Product type — auto-map via client aliases if available
    const rawProductType = mapping.productTypeColumn != null
      ? safe(trimmed, mapping.productTypeColumn) : ''
    const productType = resolveProductType(rawProductType, client ?? null)
    const requiredAngles = getRequiredAngles(productType, client ?? null)

    // Extra fields
    const extraFields: Record<string, string> = {}
    for (const col of mapping.extraColumns) {
      if ([mapping.styleNumberColumn, mapping.skuColumn,
        mapping.qrSourceColumn, mapping.descriptionColumn,
        mapping.productTypeColumn].includes(col)) continue
      const key = headers[col] || `Col ${col + 1}`
      extraFields[key] = safe(trimmed, col)
    }

    items.push({
      id: uuidv4(),
      styleNumber,
      sku,
      qrCodeValue,
      description,
      extraFields,
      custodyLocation: 'with_client',
      custodyHistory: [],
      lastScannedAt: null,
      lastScannedBy: null,
      shotStatus: 'notShot',
      productType,
      requiredAngles,
      completedAngles: [],
      looks: [],
      shotAt: null,
      notes: '',
      dropId: dropId ?? null,
    })
  }

  const rawCount = mapping.hasHeaderRow ? rows.length - 1 : rows.length
  const skipped = rawCount - items.length
  if (skipped > 0) warnings.push(`${skipped} blank or invalid rows skipped.`)

  if (!items.length) {
    return {
      items: [],
      warnings,
      errorMessage: 'No valid items found. Check your column mapping.',
    }
  }

  return { items, warnings, errorMessage: null }
}

function safe(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return ''
  return row[index] ?? ''
}
