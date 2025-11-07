import http from './http'

export async function listUsers({ search = '', role, page = 1, limit = 10 } = {}) {
  const params = { page, limit }
  if (search) params.search = search
  if (role) params.role = role
  const { data } = await http.get('/users', { params })
  if (Array.isArray(data)) {
    return {
      data,
      pagination: {
        total: data.length,
        page: 1,
        limit: data.length,
        totalPages: 1,
      },
    }
  }
  return {
    data: data.data ?? [],
    pagination: data.pagination ?? null,
  }
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
