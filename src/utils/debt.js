import { parseTashkentDate, startOfTashkentDay } from './time'

function toNumber(value) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const parsed = Number(value.toString())
    return Number.isNaN(parsed) ? 0 : parsed
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function firstDayOfMonth(date) {
  if (!date || Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthsBetweenInclusive(startDate, endDate) {
  const start = firstDayOfMonth(startDate)
  const end = firstDayOfMonth(endDate)
  if (!start || !end) return 0
  const diff =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return diff < 0 ? 0 : diff + 1
}

function summarizeContractDebts(contracts = [], { asOf = new Date() } = {}) {
  let expected = 0
  let paid = 0
  let debt = 0
  let contractsWithDebt = 0
  const breakdown = []

  const asOfDate = startOfTashkentDay(asOf) || parseTashkentDate(asOf) || new Date()

  for (const contract of contracts) {
    const fee = toNumber(contract?.shopMonthlyFee)
    if (!fee) continue

    const issue = parseTashkentDate(contract?.issueDate)
    const created = parseTashkentDate(contract?.createdAt)
    const startDate = issue && !Number.isNaN(issue) ? issue : created && !Number.isNaN(created) ? created : null
    if (!startDate || Number.isNaN(startDate)) continue

    let endDate = asOfDate
    if (contract?.expiryDate) {
      const expiry = parseTashkentDate(contract.expiryDate)
      if (!Number.isNaN(expiry) && expiry < endDate) endDate = expiry
    }
    if (endDate < startDate) continue

    const months = monthsBetweenInclusive(startDate, endDate)
    if (!months) continue

    const expectedAmount = months * fee
    const paidAmount = (contract?.transactions || []).reduce((sum, tx) => {
      if (tx?.status !== 'PAID') return sum
      return sum + toNumber(tx.amount)
    }, 0)

    const normalizedPaid = Math.min(paidAmount, expectedAmount)
    const debtAmount = Math.max(expectedAmount - normalizedPaid, 0)

    expected += expectedAmount
    paid += normalizedPaid
    debt += debtAmount
    if (debtAmount > 0.0001) contractsWithDebt++

    breakdown.push({
      id: contract?.id,
      expected: expectedAmount,
      paid: normalizedPaid,
      debt: debtAmount,
      months,
    })
  }

  return {
    expected,
    paid,
    debt,
    contractsWithDebt,
    totalContracts: contracts.length,
    breakdown,
  }
}

function summarizeAttendanceDebts(attendances = []) {
  let expected = 0
  let paid = 0
  let debt = 0
  let unpaidCount = 0
  const breakdown = []

  for (const attendance of attendances) {
    const amount = toNumber(attendance?.amount)
    expected += amount
    const isPaid =
      attendance?.status === 'PAID' ||
      attendance?.transaction?.status === 'PAID'

    if (isPaid) {
      paid += amount
    } else {
      debt += amount
      unpaidCount++
    }

    breakdown.push({
      id: attendance?.id,
      expected: amount,
      paid: isPaid ? amount : 0,
      debt: isPaid ? 0 : amount,
      stallId: attendance?.stallId,
      date: attendance?.date,
    })
  }

  return {
    expected,
    paid,
    debt,
    unpaidCount,
    totalAttendances: attendances.length,
    breakdown,
  }
}

export { toNumber, firstDayOfMonth, parseTashkentDate, startOfTashkentDay, monthsBetweenInclusive, summarizeContractDebts, summarizeAttendanceDebts }
