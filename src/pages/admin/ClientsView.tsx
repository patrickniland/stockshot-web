// StockShot — Clients View
// Manage client profiles with product types and required shot angles

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Buildings, X } from '@phosphor-icons/react'
import useAppStore from '../../store/useAppStore'
import { useNavSync } from '../../hooks/useNavSync'
import { Client, ProductType, ShotAngle } from '../../types'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

export default function ClientsView() {
  useNavSync({ onEnter: 'pull', onLeave: 'push' })
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
    if (!editing || !editing.name.trim()) return
    const isNew = !clients.some(c => c.id === editing.id)
    if (isNew) {
      addClient(editing)
    } else {
      updateClient(editing)
    }
    setEditing(null)
  }

  if (editing) {
    return <ClientEditor client={editing} onChange={setEditing} onSave={saveClient} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="p-6 max-w-[760px]">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-[22px] font-semibold text-neutral-900 m-0">Clients</h1>
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={newClient}>+ New Client</Button>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-8">
          <Buildings size={48} weight="duotone" className="mx-auto mb-3 text-neutral-400" />
          <p className="font-medium text-neutral-900 mb-1.5">No clients yet</p>
          <p className="text-[12px] text-neutral-500 mb-4">Create a client to define product types and required shot angles.</p>
          <Button variant="primary" size="md" onClick={newClient}>Create First Client</Button>
        </div>
      ) : clients.map(client => (
        <Card key={client.id} padding="md" className="mb-2.5">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[15px] font-semibold text-neutral-900 mb-1">{client.name}</div>
              <div className="text-[11px] text-neutral-400">
                {client.productTypes.length} product type{client.productTypes.length !== 1 ? 's' : ''} ·
                Created {new Date(client.createdAt).toLocaleDateString('en-ZA')}
              </div>
              {client.productTypes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {client.productTypes.map(pt => (
                    <div key={pt.id} className="bg-[var(--color-surface-muted)] rounded-md px-2.5 py-1 text-[11px] text-neutral-700">
                      <span className="font-semibold">{pt.name}</span>
                      {pt.requiredAngles.length > 0 && (
                        <span className="text-neutral-400"> · {pt.requiredAngles.map(a => a.name).join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(client)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => { if (confirm(`Delete ${client.name}?`)) deleteClient(client.id) }}>Delete</Button>
            </div>
          </div>
        </Card>
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

  return (
    <div className="p-6 max-w-[720px]">
      <h1 className="text-[20px] font-semibold text-neutral-900 mb-6">
        {client.name || 'New Client'}
      </h1>

      {/* Client name */}
      <Card padding="md" className="mb-4">
        <label className="text-[11px] text-neutral-500 block mb-1.5">Client name</label>
        <input
          value={client.name}
          onChange={e => onChange({ ...client, name: e.target.value })}
          placeholder="e.g. ASOS, Zalando, Next"
          className="w-full px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none box-border"
        />
      </Card>

      {/* Product types */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center mb-3">
          <span className="text-[13px] font-semibold text-neutral-900 flex-1">Product types & required angles</span>
          <Button variant="secondary" size="sm" onClick={addProductType}>+ Add type</Button>
        </div>

        {client.productTypes.length === 0 ? (
          <p className="text-[12px] text-neutral-300 text-center py-4">
            No product types yet. Add one to define required shot angles.
          </p>
        ) : client.productTypes.map(pt => (
          <div key={pt.id} className="border border-[var(--color-border)]/60 rounded-lg p-3 mb-2.5">
            <div className="flex items-center gap-2.5 mb-2.5">
              <input
                value={pt.name}
                onChange={e => updatePT(pt.id, { name: e.target.value })}
                placeholder="Product type (e.g. Tops, Footwear)"
                className="flex-1 px-2.5 py-1.5 text-[13px] border border-[var(--color-border)] rounded-md outline-none"
              />
              <button onClick={() => removePT(pt.id)} className="bg-transparent border-none text-neutral-300 cursor-pointer flex items-center hover:text-neutral-500">
                <X size={16} />
              </button>
            </div>

            {/* Aliases */}
            <div className="mb-2.5">
              <label className="text-[10px] text-neutral-400 block mb-1">
                Aliases for auto-mapping (comma separated, e.g. TOP, 01, T)
              </label>
              <input
                defaultValue={pt.aliases.join(', ')}
                onBlur={e => updatePT(pt.id, { aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                placeholder="TOP, 01, T"
                className="w-full px-2.5 py-1.5 text-[12px] border border-[var(--color-border)] rounded-md outline-none box-border"
              />
            </div>

            {/* Angles */}
            <div>
              <div className="flex items-center mb-1.5">
                <span className="text-[10px] text-neutral-400 flex-1">Required angles</span>
                <button onClick={() => addAngle(pt.id)} className="bg-transparent border-none text-[var(--color-info)] cursor-pointer text-[11px] hover:underline">
                  + Add angle
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pt.requiredAngles.map(angle => (
                  <div key={angle.id} className="flex items-center gap-1 bg-[var(--color-surface-muted)] rounded-md px-2 py-1">
                    <input
                      value={angle.name}
                      onChange={e => updateAngle(pt.id, angle.id, e.target.value)}
                      placeholder="e.g. Front"
                      className="border-none bg-transparent text-[12px] w-20 outline-none"
                    />
                    <button onClick={() => removeAngle(pt.id, angle.id)} className="bg-transparent border-none text-neutral-300 cursor-pointer flex items-center p-0 hover:text-neutral-500">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* Actions */}
      <div className="flex gap-2.5">
        <Button variant="primary" size="md" onClick={onSave} disabled={!client.name.trim()}>
          Save Client
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
