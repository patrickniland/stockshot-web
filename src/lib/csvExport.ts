// StockShot — XLS Export Helper

import { StockItem } from '../types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function downloadXLS(rows: Record<string, string>[], filename: string) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

export async function exportStockListCSV(items: StockItem[]) {
  const rows = items.map(i => ({
    'Style Number': i.styleNumber,
    'SKU': i.sku,
    'Description': i.description,
    'Custody Location': i.custodyLocation,
    'Last Scanned At': i.lastScannedAt ?? '',
    'Last Scanned By': i.lastScannedBy ?? '',
    'Shot Status': i.shotStatus,
    'Product Type': i.productType ?? '',
  }))
  await downloadXLS(rows, `StockShot_StockList_${today()}.xlsx`)
}

export async function exportDetailedStockListCSV(items: StockItem[]) {
  const rows = items.map(i => ({
    'Style Number': i.styleNumber,
    'SKU': i.sku,
    'Description': i.description,
    'Custody Location': i.custodyLocation,
    'Last Scanned At': i.lastScannedAt ?? '',
    'Last Scanned By': i.lastScannedBy ?? '',
    'Shot Status': i.shotStatus,
    'Product Type': i.productType ?? '',
    'Custody History': JSON.stringify(i.custodyHistory),
  }))
  await downloadXLS(rows, `StockShot_StockList_Detailed_${today()}.xlsx`)
}

export async function exportMissingItemsCSV(items: StockItem[]) {
  const rows = items.map(i => ({
    'Style Number': i.styleNumber,
    'SKU': i.sku,
    'Description': i.description,
    'Product Type': i.productType ?? '',
  }))
  await downloadXLS(rows, `StockShot_Missing_${today()}.xlsx`)
}

export async function exportShotListCSV(items: StockItem[]) {
  const rows = items.map(i => ({
    'Style Number': i.styleNumber,
    'SKU': i.sku,
    'Description': i.description,
    'Shot Status': i.shotStatus,
    'Product Type': i.productType ?? '',
    'Required Angles': i.requiredAngles.join('; '),
    'Completed Angles': i.completedAngles.join('; '),
  }))
  await downloadXLS(rows, `StockShot_ShotList_${today()}.xlsx`)
}
