// StockShot — Database operations

import { supabase } from './supabase'
import { Shoot, StockItem, Client, CustodyLocation, CustodyEvent } from '../types'

// ── Shoots ────────────────────────────────────────────────────────────────────

export async function fetchShoots(orgId: string): Promise<Omit<Shoot, 'items'>[]> {
  const { data, error } = await supabase
    .from('shoots')
    .select('id, name, client_id, created_at, updated_at, drops, look_order, deleted_at, is_unassigned')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    drops: row.drops ?? [],
    lookOrder: row.look_order ?? [],
    deletedAt: row.deleted_at ?? null,
    isUnassigned: row.is_unassigned ?? false,
    items: [],
  }))
}

export async function fetchShootWithItems(shootId: string): Promise<Shoot | null> {
  const [shootRes, itemsRes] = await Promise.all([
    supabase.from('shoots').select('*').eq('id', shootId).single(),
    supabase.from('stock_items').select('*').eq('shoot_id', shootId).order('created_at', { ascending: true }),
  ])

  if (shootRes.error || !shootRes.data) return null

  const row = shootRes.data
  const items = (itemsRes.data ?? []).map(mapItemFromDB)

  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    drops: row.drops ?? [],
    lookOrder: row.look_order ?? [],
    deletedAt: row.deleted_at ?? null,
    isUnassigned: row.is_unassigned ?? false,
    items,
  }
}

export async function fetchItemsForShoot(shootId: string): Promise<StockItem[]> {
  const allItems: StockItem[] = []
  const pageSize = 1000
  let page = 0

  while (true) {
    const { data, error } = await supabase
      .from('stock_items')
      .select('*')
      .eq('shoot_id', shootId)
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    allItems.push(...data.map(mapItemFromDB))

    if (data.length < pageSize) break
    page++
  }

  return allItems
}

export async function upsertShootMeta(shoot: Omit<Shoot, 'items'>, orgId: string): Promise<void> {
  const { error } = await supabase.from('shoots').upsert({
    id: shoot.id,
    name: shoot.name,
    client_id: shoot.clientId,
    created_at: shoot.createdAt,
    updated_at: new Date().toISOString(),
    drops: shoot.drops,
    look_order: shoot.lookOrder,
    deleted_at: shoot.deletedAt ?? null,
    is_unassigned: shoot.isUnassigned,
    org_id: orgId,
  }, { onConflict: 'id' })

  if (error) throw error
}

export async function deleteShoot(shootId: string): Promise<void> {
  await supabase.from('stock_items').delete().eq('shoot_id', shootId)
  const { error } = await supabase.from('shoots').delete().eq('id', shootId)
  if (error) throw error
}

// ── Stock Items ───────────────────────────────────────────────────────────────

export async function upsertItem(item: StockItem, shootId: string, orgId: string): Promise<void> {
  const { error } = await supabase.from('stock_items').upsert(mapItemToDB(item, shootId, orgId), { onConflict: 'id' })
  if (error) throw error
}

export async function upsertItems(items: StockItem[], shootId: string, orgId: string): Promise<void> {
  if (!items.length) return
  const rows = items.map(i => mapItemToDB(i, shootId, orgId))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('stock_items').upsert(rows.slice(i, i + 500), { onConflict: 'id' })
    if (error) throw error
  }
}

export async function updateItemCustody(
  itemId: string,
  updates: {
    custodyLocation: CustodyLocation
    custodyHistory: CustodyEvent[]
    lastScannedAt?: string
    lastScannedBy?: string
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    custody_location: updates.custodyLocation,
    custody_history: updates.custodyHistory,
  }
  if (updates.lastScannedAt) payload.last_scanned_at = updates.lastScannedAt
  if (updates.lastScannedBy) payload.last_scanned_by = updates.lastScannedBy
  const { error } = await supabase.from('stock_items').update(payload).eq('id', itemId)
  if (error) throw error
}

export async function updateItemStatus(
  itemId: string,
  updates: Partial<Pick<StockItem, 'shotStatus' | 'shotAt' | 'completedAngles' | 'looks' | 'notes' | 'productType' | 'requiredAngles'>>
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {}
  if (updates.shotStatus !== undefined) dbUpdates.shot_status = updates.shotStatus
  if (updates.shotAt !== undefined) dbUpdates.shot_at = updates.shotAt
  if (updates.completedAngles !== undefined) dbUpdates.completed_angles = updates.completedAngles
  if (updates.looks !== undefined) dbUpdates.looks = updates.looks
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes
  if (updates.productType !== undefined) dbUpdates.product_type = updates.productType
  if (updates.requiredAngles !== undefined) dbUpdates.required_angles = updates.requiredAngles

  const { error } = await supabase.from('stock_items').update(dbUpdates).eq('id', itemId)
  if (error) throw error
}

export async function deleteItemsByShoot(shootId: string): Promise<void> {
  const { error } = await supabase.from('stock_items').delete().eq('shoot_id', shootId)
  if (error) throw error
}

// ── Clients ───────────────────────────────────────────────────────────────────

export async function fetchClients(orgId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    productTypes: row.product_types ?? [],
    createdAt: row.created_at,
  }))
}

export async function upsertClient(client: Client, orgId: string): Promise<void> {
  const { error } = await supabase.from('clients').upsert({
    id: client.id,
    name: client.name,
    product_types: client.productTypes,
    created_at: client.createdAt,
    org_id: orgId,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteClientFromDB(clientId: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', clientId)
  if (error) throw error
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export async function fetchShootsSince(
  orgId: string,
  since: string
): Promise<Omit<Shoot, 'items'>[]> {
  const { data, error } = await supabase
    .from('shoots')
    .select('id, name, client_id, created_at, updated_at, drops, look_order, deleted_at, is_unassigned')
    .eq('org_id', orgId)
    .gt('updated_at', since)

  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    drops: row.drops ?? [],
    lookOrder: row.look_order ?? [],
    deletedAt: row.deleted_at ?? null,
    isUnassigned: row.is_unassigned ?? false,
    items: [],
  }))
}

export async function fetchItemsSince(
  orgId: string,
  since: string
): Promise<Array<{ item: StockItem; shootId: string }>> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .eq('org_id', orgId)
    .gt('updated_at', since)

  if (error) throw error
  return (data ?? []).map(row => ({ item: mapItemFromDB(row), shootId: row.shoot_id as string }))
}

function mapItemToDB(item: StockItem, shootId: string, orgId: string) {
  return {
    id: item.id,
    shoot_id: shootId,
    org_id: orgId,
    drop_id: item.dropId,
    style_number: item.styleNumber,
    sku: item.sku,
    qr_code_value: item.qrCodeValue,
    description: item.description,
    extra_fields: item.extraFields,
    custody_location: item.custodyLocation ?? 'at_client',
    custody_history: item.custodyHistory ?? [],
    last_scanned_at: item.lastScannedAt,
    last_scanned_by: item.lastScannedBy,
    shot_status: item.shotStatus,
    product_type: item.productType,
    required_angles: item.requiredAngles,
    completed_angles: item.completedAngles,
    looks: item.looks,
    shot_at: item.shotAt,
    notes: item.notes,
    updated_at: new Date().toISOString(),
  }
}

function migrateLoc(loc: string): CustodyLocation {
  if (loc === 'with_client' || loc === 'dispatched_to_client') return 'at_client'
  if (loc === 'at_studio' || loc === 'in_transit' || loc === 'at_client') return loc as CustodyLocation
  return 'at_client'
}

function mapItemFromDB(row: any): StockItem {
  const rawHistory: any[] = row.custody_history ?? []
  return {
    id: row.id,
    styleNumber: row.style_number,
    sku: row.sku,
    qrCodeValue: row.qr_code_value,
    description: row.description ?? '',
    extraFields: row.extra_fields ?? {},
    custodyLocation: migrateLoc(row.custody_location ?? 'at_client'),
    custodyHistory: rawHistory.map(e => ({ ...e, location: migrateLoc(e.location) })),
    lastScannedAt: row.last_scanned_at ?? null,
    lastScannedBy: row.last_scanned_by ?? null,
    shotStatus: row.shot_status,
    productType: row.product_type ?? null,
    requiredAngles: row.required_angles ?? [],
    completedAngles: row.completed_angles ?? [],
    looks: row.looks ?? [],
    shotAt: row.shot_at ?? null,
    notes: row.notes ?? '',
    dropId: row.drop_id ?? null,
    updatedAt: row.updated_at ?? null,
  }
}
