import http from './http'

export async function listContracts(options = {}) {
  const { page = 1, limit = 10, ...rest } = options
  const params = { page, limit, ...rest }
  Object.keys(params).forEach((key) => {
    if (params[key] === undefined || params[key] === null) delete params[key]
  })
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

export async function refreshContract(id) {
  const { data } = await http.get(`/contracts/${id}/refresh`)
  return data
}

export async function getContractHistory(id, { limit = 30 } = {}) {
  const params = {}
  if (limit) params.limit = limit
  const { data } = await http.get(`/contracts/${id}/history`, { params })
  return data
}

export async function getContract(id) {
  const { data } = await http.get(`/contracts/${id}`)
  return data
}

export async function listContractPayments(id) {
  const { data } = await http.get(`/contracts/${id}/payments`)
  return data
}

export async function createContractPayments(id, payload) {
  const { data } = await http.post(`/contracts/${id}/payments`, payload)
  return data
}

export async function updateContractPayment(id, paymentId, payload) {
  const { data } = await http.patch(`/contracts/${id}/payments/${paymentId}`, payload)
  return data
}

export async function deleteContractPayment(id, paymentId) {
  const { data } = await http.delete(`/contracts/${id}/payments/${paymentId}`)
  return data
}
