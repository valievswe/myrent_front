import http from './http'

export async function getLedger(params = {}) {
  const { data } = await http.get('/statistics/reconciliation/ledger', { params })
  return data
}

export async function getContractSummary(params = {}) {
  const { data } = await http.get('/statistics/reconciliation/contracts', { params })
  return data
}

export async function getMonthlyRollup(params = {}) {
  const { data } = await http.get('/statistics/reconciliation/monthly', { params })
  return data
}
