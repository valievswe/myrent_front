import http from './http'

export async function listUsers({ search = '', role } = {}) {
  const params = {}
  if (search) params.search = search
  if (role) params.role = role
  const { data } = await http.get('/users', { params })
  return data
}

export async function createUser(payload) {
  const { data } = await http.post('/users', payload)
  return data
}

export async function updateUser(id, payload) {
  const { data } = await http.put(`/users/${id}`, payload)
  return data
}

export async function deleteUser(id) {
  const { data } = await http.delete(`/users/${id}`)
  return data
}
