import http from './http'

export async function listSections() {
  const { data } = await http.get('/sections')
  return data
}

export async function createSection(payload) {
  const { data } = await http.post('/sections', payload)
  return data
}

export async function updateSection(id, payload) {
  const { data } = await http.patch(`/sections/${id}`, payload)
  return data
}

export async function deleteSection(id) {
  const { data } = await http.delete(`/sections/${id}`)
  return data
}

