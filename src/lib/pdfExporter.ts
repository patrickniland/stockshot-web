// StockShot — PDF Exporter
// Supports stock list, shot list, and label grid (4 or 8 per row) with QR codes

import { jsPDF } from 'jspdf'
import { StockItem } from '../types'
import { generateQRDataURL } from './qrGenerator'

// ── Design system ─────────────────────────────────────────────────────────────
// Helvetica is used for all PDF text (not Inter) because jsPDF font embedding
// requires the full font as a base64 blob (~300 KB for Inter Regular alone),
// which would significantly inflate the bundle. Revisit if a build plugin or
// separate font data file is added.

const PDF_COLORS = {
  brand:           '#1C1C1E',
  accent:          '#7C3AED',
  accentBg:        '#F5F3FF',
  border:          '#E5E7EB',
  textMuted:       '#6B7280',
  textBody:        '#1C1C1E',
  rowAltBg:        '#F9FAFB',
  statusAtClient:  '#E65100',
  statusAtStudio:  '#2E7D32',
  statusInTransit: '#1565C0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    || 'untitled'
  )
}

/** Truncate at the last word boundary within maxChars, appending '…' on overflow. */
function wordTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 1 ? cut.slice(0, lastSpace) : cut) + '…'
}

/**
 * Return the first line of splitTextToSize output, appending '…' if the text
 * wrapped to more than one line. Ensures word-boundary truncation at the
 * exact rendered column width rather than a rough char-count estimate.
 */
function firstLineOf(doc: any, text: string, maxWidthMm: number): string {
  if (!text) return '—'
  const lines: string[] = doc.splitTextToSize(text, maxWidthMm)
  if (lines.length <= 1) return lines[0] ?? text
  return lines[0].replace(/\s+$/, '') + '…'
}

// ── Page header strip ─────────────────────────────────────────────────────────

const HDR_H      = 10  // mm — page header band height
const HDR_BELOW  = 5   // mm — gap below header before content starts
const CONTENT_TOP = HDR_H + HDR_BELOW  // 15 mm

function _drawPageHeader(
  doc: any,
  shootName: string,
  pageNum: number,
  totalPages: number,
  pageW: number,
  margin: number,
): void {
  doc.setDrawColor(PDF_COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(0, HDR_H, pageW, HDR_H)

  const baseY = HDR_H * 0.65  // baseline roughly centred in the 10mm strip

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(PDF_COLORS.textBody)
  doc.text(shootName || 'Untitled Shoot', margin, baseY)

  doc.setFontSize(7)
  doc.setTextColor(PDF_COLORS.textMuted)
  doc.text('StockShot', pageW / 2, baseY, { align: 'center' })
  doc.text(`${today()}   Page ${pageNum} of ${totalPages}`, pageW - margin, baseY, { align: 'right' })

  doc.setTextColor(PDF_COLORS.textBody)
}

/** Post-process: stamps the header strip on every page once total count is known. */
function addPageHeaders(doc: any, shootName: string, pageW: number, margin: number): void {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    _drawPageHeader(doc, shootName, p, total, pageW, margin)
  }
}

// ── Missing items PDF ─────────────────────────────────────────────────────────

export async function exportMissingItemsPDF(items: StockItem[]): Promise<void> {
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
// Columns: # | Style / SKU (stacked) | Description (wide) | Looks | Custody | Shot

export async function exportStockListPDF(
  items: StockItem[],
  shootName = '',
): Promise<void> {
  const doc = new jsPDF()

  const PAGE_W  = 210
  const PAGE_H  = 297
  const MARGIN  = 14
  const ROW_H   = 9    // mm — two-line rows (Style Number + SKU)
  const HDR_ROW = 7    // mm — single-line column header row

  // Column x positions (all mm from left edge of page)
  const xNum      = MARGIN       // row number
  const xStyle    = 22           // Style Number (bold) / SKU (muted) stacked
  const xDesc     = 54           // Description — widest column
  const xLooks    = 130          // Look codes: L1, L2 …
  const xCustody  = 148          // Custody status (colour-coded)
  const xShot     = 174          // Shot status (colour-coded)
  // right edge = MARGIN right = 196

  // Description column width (leave 3mm before Looks column)
  const descColW = xLooks - xDesc - 3   // 73mm

  const CUSTODY_COLOR: Record<string, string> = {
    at_studio:  PDF_COLORS.statusAtStudio,
    in_transit: PDF_COLORS.statusInTransit,
    at_client:  PDF_COLORS.statusAtClient,
  }
  const CUSTODY_LABEL: Record<string, string> = {
    at_studio:  'At Studio',
    in_transit: 'In Transit',
    at_client:  'At Client',
  }
  const SHOT_COLOR: Record<string, string> = {
    shot:        PDF_COLORS.statusAtStudio,
    notShot:     PDF_COLORS.statusAtClient,
    notRequired: PDF_COLORS.textMuted,
  }
  const SHOT_LABEL: Record<string, string> = {
    shot:        '✓ Shot',
    notShot:     'Not Shot',
    notRequired: 'N/A',
  }

  function drawColHeaders(y: number) {
    doc.setFillColor(PDF_COLORS.rowAltBg)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, HDR_ROW, 'F')
    doc.setDrawColor(PDF_COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, y + HDR_ROW, PAGE_W - MARGIN, y + HDR_ROW)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textBody)
    const hY = y + HDR_ROW * 0.68
    doc.text('#',            xNum,     hY)
    doc.text('Style / SKU',  xStyle,   hY)
    doc.text('Description',  xDesc,    hY)
    doc.text('Looks',        xLooks,   hY)
    doc.text('Custody',      xCustody, hY)
    doc.text('Shot',         xShot,    hY)
  }

  let y = CONTENT_TOP
  drawColHeaders(y)
  y += HDR_ROW

  items.forEach((item, i) => {
    if (y + ROW_H > PAGE_H - MARGIN) {
      doc.addPage()
      y = CONTENT_TOP
      drawColHeaders(y)
      y += HDR_ROW
    }

    if (i % 2 === 0) {
      doc.setFillColor(PDF_COLORS.rowAltBg)
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, ROW_H, 'F')
    }

    const line1Y = y + 3.2   // Style Number baseline (~top third of row)
    const line2Y = y + 6.8   // SKU baseline (~bottom third of row)

    // Row number
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(PDF_COLORS.textMuted)
    doc.text(`${i + 1}`, xNum, line1Y)

    // Style Number (bold)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(PDF_COLORS.textBody)
    doc.text(item.styleNumber.slice(0, 18), xStyle, line1Y)

    // SKU (smaller, muted)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(PDF_COLORS.textMuted)
    doc.text(item.sku.slice(0, 20), xStyle, line2Y)

    // Description (full column width, word-boundary first line)
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textBody)
    const descText = firstLineOf(doc, item.description || '', descColW)
    if (!item.description) doc.setTextColor(PDF_COLORS.textMuted)
    doc.text(descText, xDesc, line1Y)
    doc.setTextColor(PDF_COLORS.textBody)

    // Looks
    doc.setFontSize(7)
    doc.setTextColor(PDF_COLORS.accent)
    const looksText = item.looks.length === 0
      ? ''
      : item.looks.slice(0, 4).map((l: number) => `L${l}`).join(' ') +
        (item.looks.length > 4 ? '…' : '')
    if (looksText) doc.text(looksText, xLooks, line1Y)
    doc.setTextColor(PDF_COLORS.textBody)

    // Custody (colour-coded)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(CUSTODY_COLOR[item.custodyLocation] ?? PDF_COLORS.textMuted)
    doc.text(CUSTODY_LABEL[item.custodyLocation] ?? item.custodyLocation, xCustody, line1Y)

    // Shot status (colour-coded)
    doc.setTextColor(SHOT_COLOR[item.shotStatus] ?? PDF_COLORS.textMuted)
    doc.text(SHOT_LABEL[item.shotStatus] ?? item.shotStatus, xShot, line1Y)

    doc.setTextColor(PDF_COLORS.textBody)
    doc.setFont('helvetica', 'normal')

    y += ROW_H
  })

  addPageHeaders(doc, shootName, PAGE_W, MARGIN)

  const slug = shootName ? `_${slugify(shootName)}` : ''
  doc.save(`StockShot_StockList${slug}_${today()}.pdf`)
}

// ── Shot list PDF (grouped by look or product type) ───────────────────────────

const CUSTODY_LABEL: Record<string, string> = {
  at_client:  'At Client',
  in_transit: 'In Transit',
  at_studio:  'At Studio',
}

const CUSTODY_COLOR: Record<string, string> = {
  at_studio:  PDF_COLORS.statusAtStudio,
  in_transit: PDF_COLORS.statusInTransit,
  at_client:  PDF_COLORS.statusAtClient,
}

export async function exportShotListPDF(
  items: StockItem[],
  groupBy: 'look' | 'productType' = 'look',
  includeLocation = false,
  shootName = '',
): Promise<void> {
  const doc = new jsPDF()

  const PAGE_W      = 210
  const PAGE_H      = 297
  const MARGIN      = 14
  const GROUP_HDR_H = 7
  const COL_HDR_H   = 7
  const ROW_H       = 7
  const GROUP_GAP   = 3

  // Column layout — Location is optional; Description takes the freed space when off
  const xStyle   = MARGIN
  const xDesc    = 56
  const xLoc     = includeLocation ? 128 : null   // 72mm description when on
  const xShot    = includeLocation ? 157 : 155    // 95mm description when off
  const xAng     = includeLocation ? 177 : 178
  const descColW = (xLoc ?? xShot) - xDesc - 4   // 70mm (with loc) / 91mm (without)

  const SHOT_COLOR: Record<string, string> = {
    shot:        PDF_COLORS.statusAtStudio,
    notShot:     PDF_COLORS.statusAtClient,
    notRequired: PDF_COLORS.textMuted,
  }

  // Build groups
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

  let y = CONTENT_TOP

  for (const [groupName, groupItems] of Object.entries(groups)) {
    if (y + GROUP_HDR_H + COL_HDR_H + ROW_H > PAGE_H - MARGIN) {
      doc.addPage()
      y = CONTENT_TOP
    }

    // ── Group header band ──────────────────────────────────────────────────
    doc.setFillColor(PDF_COLORS.accentBg)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, GROUP_HDR_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.accent)
    doc.text(
      `${groupName}  (${groupItems.length} item${groupItems.length !== 1 ? 's' : ''})`,
      MARGIN + 3,
      y + GROUP_HDR_H * 0.70,
    )
    y += GROUP_HDR_H

    // ── Column headers ─────────────────────────────────────────────────────
    doc.setFillColor(PDF_COLORS.rowAltBg)
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, COL_HDR_H, 'F')
    doc.setDrawColor(PDF_COLORS.border)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, y + COL_HDR_H, PAGE_W - MARGIN, y + COL_HDR_H)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textBody)
    const hY = y + COL_HDR_H * 0.70
    doc.text('Style Number', xStyle + 2, hY)
    doc.text('Description',  xDesc,      hY)
    if (xLoc != null) doc.text('Location', xLoc, hY)
    doc.text('Shot',         xShot,      hY)
    doc.text('Angles',       xAng,       hY)
    y += COL_HDR_H

    // ── Data rows ──────────────────────────────────────────────────────────
    groupItems.forEach((item, i) => {
      if (y + ROW_H > PAGE_H - MARGIN) { doc.addPage(); y = CONTENT_TOP }

      if (i % 2 === 0) {
        doc.setFillColor(PDF_COLORS.rowAltBg)
        doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, ROW_H, 'F')
      }

      const rowY = y + ROW_H * 0.70

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(PDF_COLORS.textBody)
      doc.text(item.styleNumber.slice(0, 18), xStyle + 2, rowY)

      // Description — word-boundary first line using rendered column width
      const descText = firstLineOf(doc, item.description || '', descColW)
      if (!item.description) doc.setTextColor(PDF_COLORS.textMuted)
      doc.text(descText, xDesc, rowY)
      doc.setTextColor(PDF_COLORS.textBody)

      // Location (optional, colour-coded)
      if (xLoc != null) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(CUSTODY_COLOR[item.custodyLocation] ?? PDF_COLORS.textMuted)
        doc.text(CUSTODY_LABEL[item.custodyLocation] ?? item.custodyLocation, xLoc, rowY)
        doc.setTextColor(PDF_COLORS.textBody)
      }

      // Shot status (colour-coded)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(SHOT_COLOR[item.shotStatus] ?? PDF_COLORS.textMuted)
      doc.text(
        item.shotStatus === 'shot' ? '✓ Shot'
          : item.shotStatus === 'notRequired' ? 'N/A'
          : 'Not Shot',
        xShot, rowY,
      )

      // Angles
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(PDF_COLORS.textBody)
      const angleStr = item.requiredAngles.length > 0
        ? `${item.completedAngles.length}/${item.requiredAngles.length}`
        : '—'
      if (angleStr === '—') doc.setTextColor(PDF_COLORS.textMuted)
      doc.text(angleStr, xAng, rowY)
      doc.setTextColor(PDF_COLORS.textBody)

      y += ROW_H
    })

    y += GROUP_GAP
  }

  addPageHeaders(doc, shootName, PAGE_W, MARGIN)

  const slug = shootName ? `_${slugify(shootName)}` : ''
  doc.save(`StockShot_ShotList${slug}_${today()}.pdf`)
}

// ── Label grid PDF ────────────────────────────────────────────────────────────
// Cell layout (new): QR top-left, Style+Look top-right, Description full-width
// below QR, barcode value full-width at bottom.

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
  options: LabelOptions,
  shootName = '',
): Promise<void> {

  const isNarrow   = options.perRow === 8
  const doc        = new jsPDF({ orientation: isNarrow ? 'landscape' : 'portrait' })
  const pageW      = isNarrow ? 297 : 210
  const pageH      = isNarrow ? 210 : 297
  const margin     = 8
  const cols       = isNarrow ? 8 : 4
  const labelW     = (pageW - margin * 2) / cols
  const labelH     = isNarrow ? 38 : 52    // slightly taller to fit description row
  const qrSize     = isNarrow ? 22 : 28
  const LOOK_HDR_H = 7
  const PAGE_BOTTOM = pageH - margin
  const cellPad    = 2       // mm — internal label padding

  // Right-of-QR text region dimensions
  const txLeft  = margin + cellPad + qrSize + 1.5  // offset per-column computed below
  const textRegionW = labelW - qrSize - cellPad * 2 - 2.5  // available mm for style/look
  const fsStyle = isNarrow ? 5   : 8     // pt — style number font size
  const fsLook  = isNarrow ? 6   : 9     // pt — look code font size (larger/accent)
  const fsDesc  = isNarrow ? 5   : 7     // pt — description font size
  const fsQrVal = isNarrow ? 4   : 5     // pt — QR value font size

  // Vertical positions within cell (all relative to cell top-left ly)
  const qrTop       = cellPad                            // QR top
  const qrBot       = cellPad + qrSize                   // QR bottom
  const styleBase   = qrTop + (isNarrow ? 2.5 : 3.5)    // Style Number baseline
  const lookBase    = styleBase + (isNarrow ? 3.5 : 5.0) // Look code baseline
  const descTop     = qrBot + 2                          // Description zone start
  const qrValTop    = labelH - cellPad - (isNarrow ? 2 : 2.5) // QR value baseline

  // Description width uses full cell interior
  const descW = labelW - cellPad * 2

  // Build groups
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

  // Pre-generate all QR codes
  const qrCache: Record<string, string> = {}
  for (const item of items) {
    if (!qrCache[item.qrCodeValue]) {
      qrCache[item.qrCodeValue] = await generateQRDataURL(item.qrCodeValue)
    }
  }

  let y          = CONTENT_TOP
  let currentCol = 0

  for (const group of groups) {
    // Flush partial row before the group header
    if (currentCol > 0) {
      currentCol = 0
      y += labelH
    }
    // Push to next page if header + one label row won't fit
    if (y + LOOK_HDR_H + labelH > PAGE_BOTTOM) {
      doc.addPage()
      y = CONTENT_TOP
    }

    // ── Group header band ──────────────────────────────────────────────────
    doc.setFillColor(PDF_COLORS.accentBg)
    doc.rect(margin, y, pageW - margin * 2, LOOK_HDR_H, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.accent)
    doc.text(
      `${group.name}  (${group.items.length} item${group.items.length !== 1 ? 's' : ''})`,
      margin + 3,
      y + LOOK_HDR_H * 0.70,
    )
    doc.setTextColor(PDF_COLORS.textBody)
    y += LOOK_HDR_H

    // ── Label cells ────────────────────────────────────────────────────────
    for (const item of group.items) {
      if (currentCol === 0 && y + labelH > PAGE_BOTTOM) {
        doc.addPage()
        y = CONTENT_TOP
      }

      const lx = margin + currentCol * labelW
      const ly = y

      // Cell border
      doc.setDrawColor(PDF_COLORS.border)
      doc.setLineWidth(0.5)
      doc.rect(lx + 0.5, ly + 0.5, labelW - 1, labelH - 1)

      // ── QR code (top-left) ───────────────────────────────────────────────
      const qrData = qrCache[item.qrCodeValue]
      if (qrData) {
        doc.addImage(qrData, 'PNG', lx + cellPad, ly + qrTop, qrSize, qrSize)
      }

      // ── Style Number (top-right, beside QR) ─────────────────────────────
      const colTxLeft = lx + cellPad + qrSize + 1.5
      if (options.showStyleNumber) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(fsStyle)
        doc.setTextColor(PDF_COLORS.textBody)
        const sn = firstLineOf(doc, item.styleNumber, textRegionW)
        doc.text(sn, colTxLeft, ly + styleBase)
      }

      // ── Look code (below Style Number, right-of-QR, accent colour) ──────
      if (options.showLookNumber && item.looks.length > 0) {
        const lookStr = item.looks.slice(0, 3).map((l: number) => `L${l}`).join(' ') +
          (item.looks.length > 3 ? '…' : '')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(fsLook)
        doc.setTextColor(PDF_COLORS.accent)
        doc.text(lookStr, colTxLeft, ly + lookBase)
        doc.setTextColor(PDF_COLORS.textBody)
      }

      // ── Description (full cell width, below QR zone) ─────────────────────
      if (options.showDescription) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(fsDesc)
        doc.setTextColor(PDF_COLORS.textMuted)

        if (item.description) {
          // Allow up to 2 lines; ellipsis only if a single word overflows
          const lines: string[] = doc.splitTextToSize(item.description, descW - 1)
          const maxLines = 2
          const display = lines.slice(0, maxLines)
          if (lines.length > maxLines) {
            display[maxLines - 1] = display[maxLines - 1].replace(/\s+$/, '') + '…'
          }
          const lineH = fsDesc * 0.42    // mm — line height for this font size
          display.forEach((line: string, li: number) => {
            doc.text(line, lx + cellPad, ly + descTop + lineH + li * (lineH + 0.5))
          })
        }
        doc.setTextColor(PDF_COLORS.textBody)
      }

      // ── QR value (full cell width, bottom of cell) ───────────────────────
      if (options.showQRValue) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(fsQrVal)
        doc.setTextColor(PDF_COLORS.textMuted)
        const qrVal = item.qrCodeValue.length > 22
          ? item.qrCodeValue.slice(0, 22) + '…'
          : item.qrCodeValue
        doc.text(qrVal, lx + cellPad, ly + qrValTop)
        doc.setTextColor(PDF_COLORS.textBody)
      }

      currentCol++
      if (currentCol >= cols) {
        currentCol = 0
        y += labelH
      }
    }

    // Flush partial row at end of group
    if (currentCol > 0) {
      currentCol = 0
      y += labelH
    }
  }

  addPageHeaders(doc, shootName, pageW, margin)

  const slug = shootName ? `_${slugify(shootName)}` : ''
  doc.save(`StockShot_Labels${slug}_${today()}.pdf`)
}
