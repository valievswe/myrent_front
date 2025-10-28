import http from './http'

export async function listSaleTypes() {
  const { data } = await http.get('/sale-types')
  return data
}

export async function createSaleType(payload) {
  const { data } = await http.post('/sale-types', payload)
  return data
}

export async function updateSaleType(id, payload) {
  const { data } = await http.put(`/sale-types/${id}`, payload)
  return data
}

export async function deleteSaleType(id) {
  const { data } = await http.delete(`/sale-types/${id}`)
  return data
}

