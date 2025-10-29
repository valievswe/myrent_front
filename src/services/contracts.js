import http from './http'

export async function listContracts({ page = 1, limit = 10, isActive } = {}) {
  const params = { page, limit }
  if (typeof isActive === 'boolean') params.isActive = isActive
  const { data } = await http.get('/contracts', { params })
  return data // { data, pagination }
}

export async function createContract(payload) {
  const { data } = await http.post('/contracts', payload)
  return data
}

export async function updateContract(id, payload) {
  const { data } = await http.put(`/contracts/${id}`, payload)
  return data
}

export async function deleteContract(id) {
  const { data } = await http.delete(`/contracts/${id}`)
  return data
}
