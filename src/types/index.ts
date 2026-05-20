// StockShot — Core Types

export type CustodyLocation = 'at_client' | 'in_transit' | 'at_studio'

export interface CustodyEvent {
  location: CustodyLocation
  timestamp: string  // ISO
  operator: string
  shoot_id: string
  notes?: string
}

export type ItemStatus = 'pending' | 'received' | 'dispatched' | 'flagged'  // kept for transition, removed in Phase 6
export type ShotStatus = 'notShot' | 'shot' | 'notRequired'
export type ImportMode = 'jobList' | 'mappingReference'
export type FeedbackType = 'success' | 'notFound' | 'alreadyReceived' | 'alreadyDispatched' | 'notYetReceived' | 'alreadyAtLocation' | 'wrongShoot'

// Required shot angle (e.g. Front, Back, Detail)
export interface ShotAngle {
  id: string
  name: string
}

// Product type template (e.g. Tops, Footwear) — defined per client
export interface ProductType {
  id: string
  name: string
  aliases: string[]
  requiredAngles: ShotAngle[]
}

// Client profile — reusable across shoots
export interface Client {
  id: string
  name: string
  productTypes: ProductType[]
  createdAt: string
}

// Column mapping for import
export interface ColumnMapping {
  styleNumberColumn: number
  skuColumn: number
  qrSourceColumn: number
  descriptionColumn: number | null
  productTypeColumn: number | null
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

  // Custody (replaces status/receivedAt/dispatchedAt/dispatchedTo)
  custodyLocation: CustodyLocation
  custodyHistory: CustodyEvent[]
  lastScannedAt: string | null
  lastScannedBy: string | null

  shotStatus: ShotStatus
  productType: string | null
  requiredAngles: string[]
  completedAngles: string[]
  looks: number[]
  shotAt: string | null
  notes: string
  updatedAt?: string | null
  dropId: string | null

  // Legacy — optional during transition, removed in Phase 6
  status?: ItemStatus
  receivedAt?: string | null
  dispatchedAt?: string | null
  dispatchedTo?: string
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
  deletedAt: string | null
  isUnassigned: boolean
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
