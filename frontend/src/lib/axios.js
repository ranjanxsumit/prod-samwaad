import axios from 'axios'

// Central axios defaults for the app. Use VITE_API_URL in production builds.
const apiUrl = import.meta.env.VITE_API_URL || ''

if (apiUrl) {
  // if VITE_API_URL is provided, use it as baseURL so relative axios calls target the API
  axios.defaults.baseURL = apiUrl.replace(/\/$/, '')
} else {
  // no API URL provided - keep relative requests (use dev proxy or same origin)
  axios.defaults.baseURL = ''
}

export default axios
