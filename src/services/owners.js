import http from './http'

export async function listOwners({ search = '', page = 1, limit = 10 } = {}) {
  const { data } = await http.get('/owners', { params: { search, page, limit } })
  return data // { data: Owner[], pagination: { total, page, limit, totalPages } }
}

export async function createOwner(payload) {
  const { data } = await http.post('/owners', payload)
  return data
}

export async function updateOwner(id, payload) {
  const { data } = await http.patch(`/owners/${id}`, payload)
  return data
}

export async function deleteOwner(id) {
  const { data } = await http.delete(`/owners/${id}`)
  return data
}

