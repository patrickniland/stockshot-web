// StockShot — Database operations
// All Supabase read/write operations live here

import { supabase } from './supabase'
import { Shoot, Client } from '../types'

// ── Shoots ────────────────────────────────────────────────────────────────────

export async function fetchShoots(orgId: string): Promise<Shoot[]> {
  const { data, error } = await supabase
    .from('shoots')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.items ?? [],
    drops: row.drops ?? [],
    lookOrder: row.look_order ?? [],
  }))
}

export async function upsertShoot(shoot: Shoot, orgId: string): Promise<void> {
  const { error } = await supabase.from('shoots').upsert({
    id: shoot.id,
    name: shoot.name,
    client_id: shoot.clientId,
    created_at: shoot.createdAt,
    updated_at: new Date().toISOString(),
    items: shoot.items,
    drops: shoot.drops,
    look_order: shoot.lookOrder,
    org_id: orgId,
  }, { onConflict: 'id' })

  if (error) throw error
}

export async function deleteShoot(shootId: string): Promise<void> {
  const { error } = await supabase.from('shoots').delete().eq('id', shootId)
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
