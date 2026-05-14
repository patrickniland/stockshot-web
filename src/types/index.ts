// StockShot — Core Types
// Forward-planned for all phases including shot templates, client profiles, and angle tracking

export type ItemStatus = 'pending' | 'received' | 'dispatched' | 'flagged'
export type ShotStatus = 'notShot' | 'shot' | 'notRequired'
export type ImportMode = 'jobList' | 'mappingReference'
export type FeedbackType = 'success' | 'notFound' | 'alreadyReceived' | 'alreadyDispatched' | 'notYetReceived'

// Required shot angle (e.g. Front, Back, Detail)
export interface ShotAngle {
  id: string
  name: string // e.g. "Front", "Back", "Detail", "Flat"
}

// Product type template (e.g. Tops, Footwear) — defined per client
export interface ProductType {
  id: string
  name: string                // e.g. "Tops"
  aliases: string[]           // e.g. ["TOP", "01", "T"] for auto-mapping at import
  requiredAngles: ShotAngle[] // e.g. [Front, Back, Detail]
}

// Client profile — reusable across shoots
export interface Client {
  id: string
  name: string
  productTypes: ProductType[] // shot template per product type
  createdAt: string
}

// Column mapping for import
export interface ColumnMapping {
  styleNumberColumn: number
  skuColumn: number
  qrSourceColumn: number
  descriptionColumn: number | null
  productTypeColumn: number | null  // new — maps to product type for auto-assignment
  hasHeaderRow: boolean
  extraColumns: number[]
  scannableColumns: number[]
}

// A single import batch within a shoot
export interface Drop {
  id: string
  name: string
  importedAt: string
  sourceFilename: string
  importMode: ImportMode
  columnMapping: ColumnMapping
  itemCount: number
}

// A single garment / product
export interface StockItem {
  id: string
  styleNumber: string
  sku: string
  qrCodeValue: string
  description: string
  extraFields: Record<string, string>

  status: ItemStatus
  shotStatus: ShotStatus       // simple overall shot status (backwards compat)

  // Shot angle tracking (new — for per-angle shot verification)
  productType: string | null   // e.g. "Tops" — assigned at import or manually
  requiredAngles: string[]     // inherited from client template, e.g. ["Front","Back","Detail"]
  completedAngles: string[]    // ticked off during shoot, e.g. ["Front"]

  looks: number[]
  receivedAt: string | null
  dispatchedAt: string | null
  dispatchedTo: string
  shotAt: string | null
  notes: string
  updatedAt?: string | null  // from Supabase server clock
  dropId: string | null
}

// A named production session
export interface Shoot {
  id: string
  name: string
  clientId: string | null
  createdAt: string
  updatedAt: string
  items: StockItem[]
  drops: Drop[]
  lookOrder: number[]
  deletedAt: string | null  // null = active, string = soft deleted
}

// Import result from file parsing
export interface ImportResult {
  items: StockItem[]
  warnings: string[]
  errorMessage: string | null
}

// Scan feedback
export interface ScanFeedback {
  id: string
  type: FeedbackType
  message: string
  scannedValue: string
}

// Default column mapping
export const defaultColumnMapping: ColumnMapping = {
  styleNumberColumn: 0,
  skuColumn: 1,
  qrSourceColumn: 1,
  descriptionColumn: null,
  productTypeColumn: null,
  hasHeaderRow: true,
  extraColumns: [],
  scannableColumns: [1],
}
