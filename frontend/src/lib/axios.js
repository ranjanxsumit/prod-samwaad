import axios from 'axios'

// Central axios defaults for the app. Use a runtime override `window.__API_URL` if available,
// otherwise fall back to VITE_API_URL injected at build time. If neither exists, keep
// relative requests so the app talks to the same origin.
let apiUrl = ''
try {
  // runtime override (useful for static deployments where env can't be baked in)
  if (typeof window !== 'undefined' && window.__API_URL) apiUrl = window.__API_URL
} catch (e) { /* ignore */ }
if (!apiUrl) apiUrl = import.meta.env.VITE_API_URL || ''

if (apiUrl) {
  // normalize trailing slash and set axios baseURL
  axios.defaults.baseURL = apiUrl.replace(/\/$/, '')
} else {
  axios.defaults.baseURL = ''
}

export default axios
