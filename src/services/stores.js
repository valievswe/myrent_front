import http from './http'

export async function listStores({ search = '', page = 1, limit = 10, ...rest } = {}) {
  const { data } = await http.get('/stores', { params: { search, page, limit, ...rest } })
  return data
}

export async function createStore(payload) {
  const { data } = await http.post('/stores', payload)
  return data
}

export async function updateStore(id, payload) {
  const { data } = await http.patch(`/stores/${id}`, payload)
  return data
}

export async function deleteStore(id) {
  const { data } = await http.delete(`/stores/${id}`)
  return data
}
