import http from './http'

export async function listStalls({ search = '', page = 1, limit = 10 } = {}) {
  const { data } = await http.get('/stalls', { params: { search, page, limit } })
  return data // { data, pagination }
}

export async function createStall(payload) {
  const { data } = await http.post('/stalls', payload)
  return data
}

export async function updateStall(id, payload) {
  const { data } = await http.patch(`/stalls/${id}`, payload)
  return data
}

export async function deleteStall(id) {
  const { data } = await http.delete(`/stalls/${id}`)
  return data
}
