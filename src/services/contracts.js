import http from './http'

export async function listContracts({ page = 1, limit = 10 } = {}) {
  const { data } = await http.get('/contracts', { params: { page, limit } })
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
