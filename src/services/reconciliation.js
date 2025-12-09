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

export async function getContractsMonthlyStatus(params = {}) {
  const { data } = await http.get('/statistics/reconciliation/contracts/monthly-status', { params })
  return data // { paid: [], unpaid: [], totals }
}

export async function getStallsMonthlyStatus(params = {}) {
  const { data } = await http.get('/statistics/reconciliation/stalls/monthly-status', { params })
  return data // { rows: [], totals }
}
