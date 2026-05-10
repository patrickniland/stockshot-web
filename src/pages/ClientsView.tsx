// StockShot — Clients View
// Manage client profiles with product types and required shot angles

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import useAppStore from '../store/useAppStore'
import { Client, ProductType, ShotAngle } from '../types'

export default function ClientsView() {
  const [editing, setEditing] = useState<Client | null>(null)
  const { clients, addClient, updateClient, deleteClient } = useAppStore()

  function newClient() {
    setEditing({
      id: uuidv4(),
      name: '',
      productTypes: [],
      createdAt: new Date().toISOString(),
    })
  }

  function saveClient() {
    if (!editing) return
    const exists = clients.some(c => c.id === editing.id)
    if (exists) updateClient(editing)
    else addClient(editing)
    setEditing(null)
  }

  if (editing) {
    return <ClientEditor client={editing} onChange={setEditing} onSave={saveClient} onCancel={() => setEditing(null)} />
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#111', margin: 0 }}>Clients</h1>
        <div style={{ flex: 1 }} />
        <button onClick={newClient} style={{
          padding: '8px 16px', background: '#1C1C1E', color: '#fff',
          border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: 500,
        }}>
          + New Client
        </button>
      </div>

      {clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
          <p style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</p>
          <p style={{ fontWeight: 500, color: '#111', marginBottom: '6px' }}>No clients yet</p>
          <p style={{ fontSize: '12px', marginBottom: '16px' }}>Create a client to define product types and required shot angles.</p>
          <button onClick={newClient} style={{ padding: '10px 20px', background: '#1C1C1E', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
            Create First Client
          </button>
        </div>
      ) : clients.map(client => (
        <div key={client.id} style={{
          background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px',
          padding: '16px', marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>{client.name}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>
                {client.productTypes.length} product type{client.productTypes.length !== 1 ? 's' : ''} ·
                Created {new Date(client.createdAt).toLocaleDateString('en-ZA')}
              </div>
              {client.productTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {client.productTypes.map(pt => (
                    <div key={pt.id} style={{ background: '#F5F5F5', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: '#444' }}>
                      <span style={{ fontWeight: 600 }}>{pt.name}</span>
                      {pt.requiredAngles.length > 0 && (
                        <span style={{ color: '#888' }}> · {pt.requiredAngles.map(a => a.name).join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setEditing(client)} style={{ padding: '6px 12px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#444' }}>
                Edit
              </button>
              <button onClick={() => { if (confirm(`Delete ${client.name}?`)) deleteClient(client.id) }}
                style={{ padding: '6px 12px', background: '#fff', border: '1px solid #FFCDD2', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#B71C1C' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ClientEditor({ client, onChange, onSave, onCancel }: {
  client: Client
  onChange: (c: Client) => void
  onSave: () => void
  onCancel: () => void
}) {
  function addProductType() {
    const pt: ProductType = { id: uuidv4(), name: '', aliases: [], requiredAngles: [] }
    onChange({ ...client, productTypes: [...client.productTypes, pt] })
  }

  function updatePT(id: string, updates: Partial<ProductType>) {
    onChange({
      ...client,
      productTypes: client.productTypes.map(p => p.id === id ? { ...p, ...updates } : p)
    })
  }

  function removePT(id: string) {
    onChange({ ...client, productTypes: client.productTypes.filter(p => p.id !== id) })
  }

  function addAngle(ptId: string) {
    const angle: ShotAngle = { id: uuidv4(), name: '' }
    updatePT(ptId, {
      requiredAngles: [...(client.productTypes.find(p => p.id === ptId)?.requiredAngles ?? []), angle]
    })
  }

  function updateAngle(ptId: string, angleId: string, name: string) {
    const pt = client.productTypes.find(p => p.id === ptId)
    if (!pt) return
    updatePT(ptId, {
      requiredAngles: pt.requiredAngles.map(a => a.id === angleId ? { ...a, name } : a)
    })
  }

  function removeAngle(ptId: string, angleId: string) {
    const pt = client.productTypes.find(p => p.id === ptId)
    if (!pt) return
    updatePT(ptId, { requiredAngles: pt.requiredAngles.filter(a => a.id !== angleId) })
  }

  const input: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid #E0E0E0', borderRadius: '6px',
    fontSize: '13px', outline: 'none',
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#111', marginBottom: '1.5rem' }}>
        {client.name || 'New Client'}
      </h1>

      {/* Client name */}
      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
        <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '6px' }}>Client name</label>
        <input value={client.name} onChange={e => onChange({ ...client, name: e.target.value })}
          placeholder="e.g. ASOS, Zalando, Next" style={{ ...input, width: '100%', boxSizing: 'border-box' }} />
      </div>

      {/* Product types */}
      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111', flex: 1 }}>Product types & required angles</span>
          <button onClick={addProductType} style={{ padding: '5px 12px', background: '#F5F5F5', border: '1px solid #E0E0E0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#444' }}>
            + Add type
          </button>
        </div>

        {client.productTypes.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', padding: '1rem 0' }}>
            No product types yet. Add one to define required shot angles.
          </p>
        ) : client.productTypes.map(pt => (
          <div key={pt.id} style={{ border: '1px solid #F0F0F0', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <input value={pt.name} onChange={e => updatePT(pt.id, { name: e.target.value })}
                placeholder="Product type (e.g. Tops, Footwear)"
                style={{ ...input, flex: 1 }} />
              <button onClick={() => removePT(pt.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>

            {/* Aliases */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px' }}>
                Aliases for auto-mapping (comma separated, e.g. TOP, 01, T)
              </label>
              <input
                value={pt.aliases.join(', ')}
                onChange={e => updatePT(pt.id, { aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="TOP, 01, T"
                style={{ ...input, width: '100%', boxSizing: 'border-box', fontSize: '12px' }}
              />
            </div>

            {/* Angles */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#888', flex: 1 }}>Required angles</span>
                <button onClick={() => addAngle(pt.id)} style={{ background: 'none', border: 'none', color: '#1565C0', cursor: 'pointer', fontSize: '11px' }}>
                  + Add angle
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pt.requiredAngles.map(angle => (
                  <div key={angle.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F5F5F5', borderRadius: '6px', padding: '4px 8px' }}>
                    <input value={angle.name} onChange={e => updateAngle(pt.id, angle.id, e.target.value)}
                      placeholder="e.g. Front"
                      style={{ border: 'none', background: 'transparent', fontSize: '12px', width: '80px', outline: 'none' }} />
                    <button onClick={() => removeAngle(pt.id, angle.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '12px', padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={onSave} disabled={!client.name.trim()} style={{
          padding: '10px 24px', background: !client.name.trim() ? '#E0E0E0' : '#1C1C1E',
          color: !client.name.trim() ? '#999' : '#fff',
          border: 'none', borderRadius: '8px', fontSize: '13px',
          fontWeight: 500, cursor: client.name.trim() ? 'pointer' : 'default',
        }}>
          Save Client
        </button>
        <button onClick={onCancel} style={{ padding: '10px 16px', background: '#F5F5F5', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#444' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
