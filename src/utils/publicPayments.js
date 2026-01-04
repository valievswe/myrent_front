import { formatTashkentDateISO } from './time'

function toArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  if (payload && Array.isArray(payload.contracts)) return payload.contracts
  if (payload && typeof payload === 'object') return [payload]
  return []
}

function coerceNumber(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isNaN(num) ? null : num
}

export function normalizeContracts(payload) {
  return toArray(payload).map((item) => {
    const contract = item.contract || item
    const ownerName = item.ownerName || item.owner_full_name || null
    const storeNumber = item.storeNumber || item.store_number || null
    const owner =
      item.owner ||
      contract.owner ||
      (ownerName ? { fullName: ownerName } : null)
    const store =
      item.store ||
      contract.store ||
      (storeNumber ? { storeNumber } : null)
    const payment = item.payment || contract.payment || {}

    const amountCandidate =
      payment.amountDue ??
      item.amountDue ??
      item.amount_due ??
      payment.amount ??
      item.amount ??
      item.amount ??
      contract.amountDue ??
      contract.shopMonthlyFee

    return {
      id: contract.id,
      contract,
      owner,
      store,
      payment: {
        amountDue: coerceNumber(amountCandidate),
        currency:
          payment.currency ||
          item.currency ||
          item.currencyCode ||
          (amountCandidate ? 'UZS' : null),
        dueDate: payment.dueDate || item.dueDate || contract.dueDate || null,
        label:
          payment.label ||
          item.periodLabel ||
          item.period_label ||
          payment.periodLabel ||
          null,
        outstandingBalance:
          payment.outstandingBalance ?? item.outstandingBalance ?? contract.outstandingBalance ?? null,
        status:
          payment.status ||
          item.paymentStatus ||
          item.status ||
          contract.paymentStatus ||
          null,
        isPaid:
          payment.isPaid ??
          item.isPaid ??
          item.paid ??
          contract.isPaid ??
          null,
        paidAt:
          payment.paidAt ||
          payment.lastPaidAt ||
          item.paidAt ||
          item.lastPaidAt ||
          contract.lastPaidAt ||
          contract.lastPaymentAt ||
          null,
        paidThrough: payment.paidThrough || item.paidThrough || contract.paidThrough || null,
      },
      paymentUrl:
        item.paymentUrl ||
        payment.url ||
        payment.paymentUrl ||
        contract.paymentUrl ||
        store?.click_payment_url ||
        contract.store?.click_payment_url ||
        null,
    }
  }).filter((entry) => entry.id)
}

export function normalizeStallResults(payload, { fallbackDate } = {}) {
  return toArray(payload).map((entry) => {
    const stallNumber = entry.stallNumber || entry.stall_number || null
    const stall = entry.stall || entry || {}
    const attendance = entry.attendance || stall.attendance || {}
    const payment = entry.payment || attendance.payment || {}

    const amountCandidate =
      payment.amountDue ??
      entry.amountDue ??
      entry.amount_due ??
      payment.amount ??
      attendance.amount ??
      stall.dailyFee ??
      stall.amount

    return {
      id: stall.id || stall.stallId || entry.stallId || stallNumber,
      stall: stallNumber ? { ...stall, stallNumber } : stall,
      attendance,
      payment: {
        amountDue: coerceNumber(amountCandidate),
        currency: payment.currency || entry.currency || (amountCandidate ? 'UZS' : null),
        date:
          payment.date ||
          entry.date ||
          attendance.date ||
          stall.date ||
          fallbackDate ||
          null,
        status:
          payment.status ||
          entry.status ||
          attendance.status ||
          (attendance ? 'UNPAID' : 'NO_ATTENDANCE'),
        isPaid:
          payment.isPaid ??
          entry.isPaid ??
          entry.paid ??
          attendance.isPaid ??
          null,
        paidAt: payment.paidAt || attendance.paidAt || payment.updatedAt || null,
      },
      paymentUrl:
        entry.paymentUrl ||
        payment.paymentUrl ||
        payment.url ||
        entry.payment_link ||
        null,
      paymentUrls: entry.paymentUrls || payment.urls || null,
    }
  }).filter((entry) => entry.id)
}

export function isContractEntryPaid(entry) {
  const status = String(entry?.payment?.status || '').toUpperCase()
  if (status === 'PAID') return true
  if (entry?.payment?.isPaid === true) return true
  if (entry?.payment?.outstandingBalance !== null && entry?.payment?.outstandingBalance !== undefined) {
    return Number(entry.payment.outstandingBalance) <= 0
  }
  if (entry?.payment?.amountDue !== null && entry?.payment?.amountDue !== undefined) {
    return Number(entry.payment.amountDue) <= 0
  }
  return false
}

export function isStallEntryPaid(entry) {
  const status = String(entry?.payment?.status || '').toUpperCase()
  if (status === 'PAID') return true
  if (entry?.payment?.isPaid === true) return true
  return false
}

export function resolvePeriodLabel(entry) {
  if (entry?.payment?.label) return entry.payment.label
  if (entry?.payment?.date) return formatTashkentDateISO(entry.payment.date)
  return null
}
