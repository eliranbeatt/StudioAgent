"use client"

import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useMemo, useState } from 'react'

export default function CustomersPage() {
  const customersWithContacts = useQuery(api.customers.listWithContacts, {
    status: 'active',
  })
  const createCustomer = useMutation(api.customers.findOrCreateByName)
  const addCustomerContact = useMutation(api.customers.addContact)

  const [newCustomerName, setNewCustomerName] = useState('')
  const [contactDrafts, setContactDrafts] = useState<Record<string, {
    name: string
    email: string
    phone: string
    role: string
  }>>({})

  const sortedCustomers = useMemo(() => {
    return (customersWithContacts ?? []).slice().sort((a, b) =>
      a.customer.name.localeCompare(b.customer.name)
    )
  }, [customersWithContacts])

  const getContactDraft = (customerId: string) => {
    return (
      contactDrafts[customerId] ?? {
        name: '',
        email: '',
        phone: '',
        role: '',
      }
    )
  }

  const updateContactDraft = (
    customerId: string,
    patch: Partial<{ name: string; email: string; phone: string; role: string }>
  ) => {
    setContactDrafts((prev) => ({
      ...prev,
      [customerId]: {
        ...getContactDraft(customerId),
        ...patch,
      },
    }))
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-gray-500">Track client accounts and contacts.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const trimmed = newCustomerName.trim()
            if (!trimmed) return
            await createCustomer({ name: trimmed })
            setNewCustomerName('')
          }}
        >
          <input
            value={newCustomerName}
            onChange={(event) => setNewCustomerName(event.target.value)}
            className="border border-gray-200 rounded px-3 py-2 text-sm"
            placeholder="New customer name"
          />
          <button
            type="submit"
            className="bg-black text-white px-4 py-2 rounded text-sm font-semibold"
          >
            Add
          </button>
        </form>
      </div>

      {sortedCustomers.length === 0 ? (
        <div className="mt-6 text-sm text-gray-500">No customers yet.</div>
      ) : (
        <div className="mt-6 space-y-4">
          {sortedCustomers.map(({ customer, contacts }) => {
            const draft = getContactDraft(customer._id)
            return (
              <div key={customer._id} className="border border-gray-100 rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500">ID: {customer.customerId}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400">
                    {customer.status}
                  </span>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  {contacts.length > 0
                    ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''}`
                    : 'No contacts yet'}
                </div>

                {contacts.length > 0 && (
                  <div className="mt-3 grid gap-2 text-sm">
                    {contacts.map((contact) => (
                      <div
                        key={contact._id}
                        className="rounded border border-gray-100 bg-gray-50 px-3 py-2"
                      >
                        <div className="font-semibold text-gray-800">{contact.name}</div>
                        <div className="text-xs text-gray-500">
                          {[contact.role, contact.email, contact.phone]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (!draft.name.trim()) return
                    await addCustomerContact({
                      customerId: customer._id,
                      name: draft.name.trim(),
                      email: draft.email.trim() || undefined,
                      phone: draft.phone.trim() || undefined,
                      role: draft.role.trim() || undefined,
                    })
                    updateContactDraft(customer._id, {
                      name: '',
                      email: '',
                      phone: '',
                      role: '',
                    })
                  }}
                >
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      updateContactDraft(customer._id, { name: event.target.value })
                    }
                    className="border border-gray-200 rounded px-3 py-2 text-xs"
                    placeholder="Contact name"
                  />
                  <input
                    value={draft.email}
                    onChange={(event) =>
                      updateContactDraft(customer._id, { email: event.target.value })
                    }
                    className="border border-gray-200 rounded px-3 py-2 text-xs"
                    placeholder="Email"
                  />
                  <input
                    value={draft.phone}
                    onChange={(event) =>
                      updateContactDraft(customer._id, { phone: event.target.value })
                    }
                    className="border border-gray-200 rounded px-3 py-2 text-xs"
                    placeholder="Phone"
                  />
                  <div className="flex gap-2">
                    <input
                      value={draft.role}
                      onChange={(event) =>
                        updateContactDraft(customer._id, { role: event.target.value })
                      }
                      className="border border-gray-200 rounded px-3 py-2 text-xs flex-1"
                      placeholder="Role"
                    />
                    <button
                      type="submit"
                      className="bg-gray-900 text-white px-3 py-2 rounded text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
