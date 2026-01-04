import axios from 'axios'

const runtimeApiBase = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api'
const API_BASE_URL =
  import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || runtimeApiBase
const PUBLIC_BASE_PATH = (import.meta.env.VITE_PUBLIC_PAY_PREFIX || '/public/pay').replace(/\/+$/, '')

const publicHttp = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
})

function buildPath(path = '') {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${PUBLIC_BASE_PATH}${normalized}`
}

export async function searchPublicContracts({ storeNumber, tin, fields } = {}) {
  const params = {}
  if (storeNumber) params.storeNumber = storeNumber
  if (tin) params.tin = tin
  if (fields) params.fields = fields
  const { data } = await publicHttp.get(buildPath('/contracts'), { params })
  return data
}

export async function getPublicContract(contractId) {
  if (!contractId) throw new Error('contractId is required')
  const { data } = await publicHttp.get(buildPath(`/contracts/${contractId}`))
  return data
}

export async function initiatePublicContractPayment(contractId) {
  if (!contractId) throw new Error('contractId is required')
  const { data } = await publicHttp.post(buildPath(`/contracts/${contractId}/pay`))
  return data
}

export async function getPublicStall(stallIdentifier, { date, fields } = {}) {
  if (!stallIdentifier) throw new Error('stall identifier is required')
  const params = {}
  if (date) params.date = date
  if (fields) params.fields = fields
  const encodedId = encodeURIComponent(stallIdentifier)
  const { data } = await publicHttp.get(buildPath(`/stalls/${encodedId}`), { params })
  return data
}
