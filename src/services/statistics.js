import http from './http'

export async function getDailyStatistics(type) {
  const params = {}
  if (type) params.type = type
  const { data } = await http.get('/statistics/daily', { params })
  return data // { count, revenue }
}

export async function getMonthlyStatistics(type) {
  const params = {}
  if (type) params.type = type
  const { data } = await http.get('/statistics/monthly', { params })
  return data // { count, revenue }
}

export async function getCurrentMonthIncome(type) {
  const params = {}
  if (type) params.type = type
  const { data } = await http.get('/statistics/current', { params })
  return data // { revenue }
}

// New filtered endpoints
export async function getStatisticsTotals(filters = {}) {
  const params = { ...filters }
  const { data } = await http.get('/statistics/totals', { params })
  return data // { count, revenue }
}

export async function getStatisticsSeries(filters = {}) {
  const params = { groupBy: 'daily', ...filters }
  const { data } = await http.get('/statistics/series', { params })
  return data // { labels, series: [{ key, data }] }
}
