// StockShot — CSV Export Helper

import { StockItem } from '../types'

function escape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportStockListCSV(items: StockItem[]) {
  const headers = ['Style Number', 'SKU', 'Description', 'Custody Location', 'Last Scanned At', 'Last Scanned By', 'Shot Status', 'Product Type']
  const rows = items.map(i => [
    i.styleNumber, i.sku, i.description,
    i.custodyLocation,
    i.lastScannedAt ?? '', i.lastScannedBy ?? '',
    i.shotStatus, i.productType ?? '',
  ].map(escape).join(','))
  download([headers.join(','), ...rows].join('\n'), `StockShot_StockList_${today()}.csv`)
}

export function exportDetailedStockListCSV(items: StockItem[]) {
  const headers = ['Style Number', 'SKU', 'Description', 'Custody Location', 'Last Scanned At', 'Last Scanned By', 'Shot Status', 'Product Type', 'Custody History']
  const rows = items.map(i => [
    i.styleNumber, i.sku, i.description,
    i.custodyLocation,
    i.lastScannedAt ?? '', i.lastScannedBy ?? '',
    i.shotStatus, i.productType ?? '',
    JSON.stringify(i.custodyHistory),
  ].map(escape).join(','))
  download([headers.join(','), ...rows].join('\n'), `StockShot_StockList_Detailed_${today()}.csv`)
}

export function exportMissingItemsCSV(items: StockItem[]) {
  const headers = ['Style Number', 'SKU', 'Description', 'Product Type']
  const rows = items.map(i => [
    i.styleNumber, i.sku, i.description, i.productType ?? '',
  ].map(escape).join(','))
  download([headers.join(','), ...rows].join('\n'), `StockShot_Missing_${today()}.csv`)
}

export function exportShotListCSV(items: StockItem[]) {
  const headers = ['Style Number', 'SKU', 'Shot Status', 'Product Type', 'Required Angles', 'Completed Angles']
  const rows = items.map(i => [
    i.styleNumber, i.sku, i.shotStatus,
    i.productType ?? '',
    i.requiredAngles.join(';'),
    i.completedAngles.join(';'),
  ].map(escape).join(','))
  download([headers.join(','), ...rows].join('\n'), `StockShot_ShotList_${today()}.csv`)
}
