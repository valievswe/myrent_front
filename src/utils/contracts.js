import { parseTashkentDate, startOfTashkentDay } from './time'

export function isContractActive(contract, referenceDate = new Date()) {
  if (!contract) return false
  const active = contract.isActive !== false
  if (!active) return false

  const issue = parseTashkentDate(contract.issueDate)
  const expiry = parseTashkentDate(contract.expiryDate)
  const ref = startOfTashkentDay(referenceDate) || parseTashkentDate(referenceDate) || new Date()

  if (issue && issue > ref) return false
  if (expiry && expiry < ref) return false
  return true
}

export function pickActiveContracts(contracts = [], referenceDate = new Date()) {
  return (contracts || []).filter((c) => isContractActive(c, referenceDate))
}
