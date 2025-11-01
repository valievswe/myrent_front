import http from './http'

export async function listAttendances({ page = 1, limit = 10, ...rest } = {}) {
  const { data } = await http.get('/attendances', { params: { page, limit, ...rest } })
  return data
}

export async function createAttendance(payload) {
  const { data } = await http.post('/attendances', payload)
  return data
}

export async function updateAttendance(id, payload) {
  const { data } = await http.put(`/attendances/${id}`, payload)
  return data
}

export async function deleteAttendance(id) {
  const { data } = await http.delete(`/attendances/${id}`)
  return data
}

export async function getAttendancePayUrl(id, type = "click") {
  const { data } = await http.get(`/attendances/${id}/pay/?type=${type}`)
  return data
}
