import http, { setAccessToken } from './http'

export async function signIn({ email, password }) {
  const { data } = await http.post('/auth/signin', { email, password })
  // Expect backend returns { accessToken, ... }
  if (data?.accessToken) setAccessToken(data.accessToken)
  return data
}

export async function me() {
  const { data } = await http.get('/auth/me')
  return data
}

export async function signOut() {
  await http.post('/auth/signout')
  setAccessToken(null)
}

