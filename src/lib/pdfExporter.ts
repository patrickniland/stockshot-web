// StockShot — PDF Exporter
// Uses jsPDF to generate PDF reports

import { StockItem } from '../types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function exportMissingItemsPDF(items: StockItem[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('StockShot — Missing Items', 14, 20)
  doc.setFontSize(10)
  doc.text(`Generated: ${today()}  |  Items: ${items.length}`, 14, 28)

  let y = 40
  doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y - 5, 182, 8, 'F')
  doc.text('#', 16, y)
  doc.text('Style Number', 26, y)
  doc.text('SKU', 100, y)
  doc.text('Description', 140, y)
  y += 8

  items.forEach((item, i) => {
    if (y > 270) { doc.addPage(); y = 20 }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(14, y - 5, 182, 8, 'F')
    }
    doc.text(`${i + 1}`, 16, y)
    doc.text(item.styleNumber.slice(0, 20), 26, y)
    doc.text(item.sku.slice(0, 20), 100, y)
    doc.text((item.description || '—').slice(0, 24), 140, y)
    y += 8
  })

  doc.save(`StockShot_Missing_${today()}.pdf`)
}

export async function exportShotListPDF(items: StockItem[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('StockShot — Shot List', 14, 20)
  doc.setFontSize(10)
  doc.text(`Generated: ${today()}  |  Items: ${items.length}`, 14, 28)

  let y = 40
  doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y - 5, 182, 8, 'F')
  doc.text('#', 16, y)
  doc.text('Style Number', 26, y)
  doc.text('SKU', 90, y)
  doc.text('Status', 140, y)
  doc.text('Angles', 165, y)
  y += 8

  items.forEach((item, i) => {
    if (y > 270) { doc.addPage(); y = 20 }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(14, y - 5, 182, 8, 'F')
    }
    doc.text(`${i + 1}`, 16, y)
    doc.text(item.styleNumber.slice(0, 18), 26, y)
    doc.text(item.sku.slice(0, 16), 90, y)
    doc.text(item.shotStatus, 140, y)
    const angleStr = item.requiredAngles.length > 0
      ? `${item.completedAngles.length}/${item.requiredAngles.length}`
      : '—'
    doc.text(angleStr, 165, y)
    y += 8
  })

  doc.save(`StockShot_ShotList_${today()}.pdf`)
}

export async function exportStockListPDF(items: StockItem[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('StockShot — Stock List', 14, 20)
  doc.setFontSize(10)
  doc.text(`Generated: ${today()}  |  Items: ${items.length}`, 14, 28)

  let y = 40
  doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y - 5, 182, 8, 'F')
  doc.text('#', 16, y)
  doc.text('Style Number', 26, y)
  doc.text('SKU', 90, y)
  doc.text('Status', 140, y)
  doc.text('Shot', 170, y)
  y += 8

  items.forEach((item, i) => {
    if (y > 270) { doc.addPage(); y = 20 }
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(14, y - 5, 182, 8, 'F')
    }
    doc.text(`${i + 1}`, 16, y)
    doc.text(item.styleNumber.slice(0, 18), 26, y)
    doc.text(item.sku.slice(0, 16), 90, y)
    doc.text(item.status, 140, y)
    doc.text(item.shotStatus, 170, y)
    y += 8
  })

  doc.save(`StockShot_StockList_${today()}.pdf`)
}
