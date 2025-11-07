import http from './http'

export async function listTransactions({
  search = '',
  page = 1,
  limit = 10,
  status,
  paymentMethod,
  dateFrom,
  dateTo,
  contractId,
  attendanceId,
  source,
} = {}) {
  const params = { search, page, limit }
  if (status) params.status = status
  if (paymentMethod) params.paymentMethod = paymentMethod
  if (dateFrom) params.dateFrom = dateFrom
  if (dateTo) params.dateTo = dateTo
  if (contractId) params.contractId = contractId
  if (attendanceId) params.attendanceId = attendanceId
  if (source) params.source = source

  const { data } = await http.get('/transactions', { params })
  return data
}

export async function createTransaction(payload) {
  const { data } = await http.post('/transactions', payload)
  return data
}

export async function updateTransaction(id, payload) {
  const { data } = await http.put(`/transactions/${id}`, payload)
  return data
}

export async function deleteTransaction(id) {
  const { data } = await http.delete(`/transactions/${id}`)
  return data
}
