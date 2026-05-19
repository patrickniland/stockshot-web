// StockShot — PDF Exporter
// Supports list print and label grid (4 or 8 per row) with QR codes

import { StockItem } from '../types'
import { generateQRDataURL } from './qrGenerator'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Missing items PDF ─────────────────────────────────────────────────────────

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
    if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(14, y - 5, 182, 8, 'F') }
    doc.text(`${i + 1}`, 16, y)
    doc.text(item.styleNumber.slice(0, 20), 26, y)
    doc.text(item.sku.slice(0, 20), 100, y)
    doc.text((item.description || '—').slice(0, 24), 140, y)
    y += 8
  })

  doc.save(`StockShot_Missing_${today()}.pdf`)
}

// ── Stock list PDF ────────────────────────────────────────────────────────────

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
  doc.text('#', 16, y); doc.text('Style Number', 26, y)
  doc.text('SKU', 90, y); doc.text('Status', 140, y); doc.text('Shot', 170, y)
  y += 8

  items.forEach((item, i) => {
    if (y > 270) { doc.addPage(); y = 20 }
    if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(14, y - 5, 182, 8, 'F') }
    doc.text(`${i + 1}`, 16, y)
    doc.text(item.styleNumber.slice(0, 18), 26, y)
    doc.text(item.sku.slice(0, 16), 90, y)
    doc.text(item.custodyLocation, 140, y)
    doc.text(item.shotStatus, 170, y)
    y += 8
  })

  doc.save(`StockShot_StockList_${today()}.pdf`)
}

// ── Shot list PDF (list format, grouped by look or product type) ──────────────

const CUSTODY_LABEL: Record<string, string> = {
  with_client: 'With Client',
  in_transit: 'In Transit',
  at_studio: 'At Studio',
  dispatched_to_client: 'Dispatched',
}

export async function exportShotListPDF(
  items: StockItem[],
  groupBy: 'look' | 'productType' = 'look',
  includeLocation = false,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('StockShot — Shot List', 14, 20)
  doc.setFontSize(10)
  doc.text(`Generated: ${today()}  |  Items: ${items.length}  |  Grouped by: ${groupBy === 'look' ? 'Look' : 'Product Type'}`, 14, 28)

  let y = 40

  // Column x positions — shift if location column included
  const xStyle = 16
  const xDesc  = 65
  const xLoc   = includeLocation ? 120 : null
  const xShot  = includeLocation ? 152 : 135
  const xAng   = includeLocation ? 172 : 158
  const descMax = includeLocation ? 20 : 28

  // Group items
  const groups: Record<string, StockItem[]> = {}
  if (groupBy === 'look') {
    const looks = [...new Set(items.flatMap(i => i.looks))].sort((a, b) => a - b)
    looks.forEach(look => {
      groups[`Look ${look}`] = items.filter(i => i.looks.includes(look))
    })
  } else {
    items.forEach(item => {
      const key = item.productType || 'Unassigned'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    })
  }

  for (const [groupName, groupItems] of Object.entries(groups)) {
    if (y > 260) { doc.addPage(); y = 20 }

    // Group header
    doc.setFillColor(237, 233, 254)
    doc.rect(14, y - 5, 182, 9, 'F')
    doc.setFontSize(10)
    doc.setTextColor(123, 31, 162)
    doc.text(`${groupName}  (${groupItems.length} items)`, 16, y)
    doc.setTextColor(0, 0, 0)
    y += 10

    // Column headers
    doc.setFontSize(8)
    doc.setFillColor(245, 245, 245)
    doc.rect(14, y - 4, 182, 7, 'F')
    doc.text('Style Number', xStyle, y)
    doc.text('Description', xDesc, y)
    if (xLoc != null) doc.text('Location', xLoc, y)
    doc.text('Shot', xShot, y)
    doc.text('Angles', xAng, y)
    y += 8

    groupItems.forEach((item, i) => {
      if (y > 270) { doc.addPage(); y = 20 }
      if (i % 2 === 0) { doc.setFillColor(252, 252, 252); doc.rect(14, y - 4, 182, 7, 'F') }
      doc.setFontSize(8)
      doc.text(item.styleNumber.slice(0, 18), xStyle, y)
      doc.text((item.description || '—').slice(0, descMax), xDesc, y)
      if (xLoc != null) doc.text((CUSTODY_LABEL[item.custodyLocation] ?? item.custodyLocation).slice(0, 12), xLoc, y)
      doc.text(item.shotStatus === 'shot' ? '✓ Shot' : item.shotStatus === 'notRequired' ? 'N/A' : 'Not Shot', xShot, y)
      const angleStr = item.requiredAngles.length > 0
        ? `${item.completedAngles.length}/${item.requiredAngles.length}`
        : '—'
      doc.text(angleStr, xAng, y)
      y += 7
    })
    y += 6
  }

  doc.save(`StockShot_ShotList_${today()}.pdf`)
}

// ── Label grid PDF ────────────────────────────────────────────────────────────

export interface LabelOptions {
  perRow: 4 | 8
  groupBy: 'look' | 'productType'
  showStyleNumber: boolean
  showDescription: boolean
  showLookNumber: boolean
  showQRValue: boolean
}

export async function exportLabelGridPDF(
  items: StockItem[],
  options: LabelOptions
): Promise<void> {
  const { jsPDF } = await import('jspdf')

  const isNarrow = options.perRow === 8
  const doc = new jsPDF({ orientation: isNarrow ? 'landscape' : 'portrait' })

  const pageW = isNarrow ? 297 : 210
  const pageH = isNarrow ? 210 : 297
  const margin = 8
  const cols = options.perRow === 4 ? 4 : 8
  const labelW = (pageW - margin * 2) / cols
  const labelH = isNarrow ? 36 : 50
  const qrSize = isNarrow ? 22 : 28
  const maxTextW = labelW - qrSize - 6
  const fontSize = isNarrow ? 5.5 : 6.5

  // Group items
  const groups: Array<{ name: string; items: StockItem[] }> = []
  if (options.groupBy === 'look') {
    const looks = [...new Set(items.flatMap(i => i.looks))].sort((a, b) => a - b)
    looks.forEach(look => {
      const gi = items.filter(i => i.looks.includes(look))
      if (gi.length) groups.push({ name: `Look ${look}`, items: gi })
    })
  } else {
    const types = [...new Set(items.map(i => i.productType || 'Unassigned'))]
    types.forEach(type => {
      const gi = items.filter(i => (i.productType || 'Unassigned') === type)
      if (gi.length) groups.push({ name: type, items: gi })
    })
  }

  let currentCol = 0
  let currentRow = 0
  let pageItemCount = 0
  const rowsPerPage = Math.floor((pageH - margin * 2) / labelH)
  const labelsPerPage = cols * rowsPerPage

  // Generate QR codes for all items first
  const qrCache: Record<string, string> = {}
  for (const item of items) {
    if (!qrCache[item.qrCodeValue]) {
      qrCache[item.qrCodeValue] = await generateQRDataURL(item.qrCodeValue)
    }
  }

  for (const group of groups) {
    // Group header — takes full row
    if (currentCol > 0) {
      currentRow++
      currentCol = 0
    }

    // New page if needed
    if (pageItemCount > 0 && currentRow >= rowsPerPage) {
      doc.addPage()
      currentRow = 0
      currentCol = 0
      pageItemCount = 0
    }

    // Draw group header
    const hx = margin
    const hy = margin + currentRow * labelH
    doc.setFillColor(237, 233, 254)
    doc.rect(hx, hy, pageW - margin * 2, 8, 'F')
    doc.setFontSize(9)
    doc.setTextColor(123, 31, 162)
    doc.text(`${group.name}  (${group.items.length} items)`, hx + 2, hy + 5.5)
    doc.setTextColor(0, 0, 0)
    currentRow++
    pageItemCount++

    for (const item of group.items) {
      // New page if needed
      if (currentRow >= rowsPerPage) {
        doc.addPage()
        currentRow = 0
        currentCol = 0
        pageItemCount = 0
      }

      const x = margin + currentCol * labelW
      const y = margin + currentRow * labelH

      // Label border
      doc.setDrawColor(220, 220, 220)
      doc.rect(x + 1, y + 1, labelW - 2, labelH - 2)

      // QR code
      const qrData = qrCache[item.qrCodeValue]
      if (qrData) {
        doc.addImage(qrData, 'PNG', x + 2, y + 2, qrSize, qrSize)
      }

      // Text fields — truncated to single lines, no wrapping
      const tx = x + qrSize + 3
      let ty = y + 6
      const maxChars = isNarrow ? 10 : 14

      doc.setFontSize(fontSize)

      if (options.showStyleNumber) {
        doc.setFont('helvetica', 'bold')
        const sn = item.styleNumber.length > maxChars + 2
          ? item.styleNumber.slice(0, maxChars + 2)
          : item.styleNumber
        doc.text(sn, tx, ty)
        ty += isNarrow ? 4.5 : 5.5
        doc.setFont('helvetica', 'normal')
      }

      if (options.showDescription && item.description) {
        const desc = item.description.length > maxChars
          ? item.description.slice(0, maxChars) + '…'
          : item.description
        doc.text(desc, tx, ty)
        ty += isNarrow ? 4 : 5
      }

      if (options.showLookNumber) {
        doc.setTextColor(123, 31, 162)
        const lookStr = `L${item.looks.join(',')}`
        doc.text(lookStr, tx, ty)
        doc.setTextColor(0, 0, 0)
        ty += isNarrow ? 4 : 5
      }

      if (options.showQRValue) {
        doc.setFontSize(isNarrow ? 4.5 : 5.5)
        doc.setTextColor(150, 150, 150)
        const qrVal = item.qrCodeValue.length > maxChars + 2
          ? item.qrCodeValue.slice(0, maxChars + 2)
          : item.qrCodeValue
        doc.text(qrVal, tx, ty)
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(fontSize)
      }

      currentCol++
      if (currentCol >= cols) {
        currentCol = 0
        currentRow++
        pageItemCount++
      }
    }

    // End of group — move to next row
    if (currentCol > 0) {
      currentRow++
      currentCol = 0
      pageItemCount++
    }
  }

  doc.save(`StockShot_Labels_${options.perRow}up_${today()}.pdf`)
}
