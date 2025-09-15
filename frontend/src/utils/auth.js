import axios from 'axios'

let logoutTimer = null

export function setToken(token) {
  if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
  else delete axios.defaults.headers.common['Authorization']
}

// tokenExpiry is epoch ms or null. If provided, schedule a logout callback
export function scheduleTokenExpiry(tokenExpiry, onLogout) {
  if (logoutTimer) clearTimeout(logoutTimer)
  if (!tokenExpiry) return
  const ms = tokenExpiry - Date.now()
  if (ms <= 0) return onLogout()
  logoutTimer = setTimeout(() => {
    onLogout()
  }, ms)
}

export function clearScheduledExpiry() {
  if (logoutTimer) clearTimeout(logoutTimer)
  logoutTimer = null
}
