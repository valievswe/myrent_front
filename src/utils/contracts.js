export function isContractActive(contract, referenceDate = new Date()) {
  if (!contract) return false
  const active = contract.isActive !== false
  if (!active) return false

  const issue = contract.issueDate ? new Date(contract.issueDate) : null
  const expiry = contract.expiryDate ? new Date(contract.expiryDate) : null
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate)

  if (issue && issue > ref) return false
  if (expiry && expiry < ref) return false
  return true
}

export function pickActiveContracts(contracts = [], referenceDate = new Date()) {
  return (contracts || []).filter((c) => isContractActive(c, referenceDate))
}
