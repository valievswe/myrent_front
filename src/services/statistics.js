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

