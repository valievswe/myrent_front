import http from './http'

export async function listSaleTypes({ search = '', page = 1, limit = 10 } = {}) {
  const params = { page, limit }
  if (search) params.search = search
  const { data } = await http.get('/sale-types', { params })
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
