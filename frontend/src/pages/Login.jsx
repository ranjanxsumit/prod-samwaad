import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setAuth } from '../store/slices/authSlice'
import { setToken, scheduleTokenExpiry } from '../utils/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const nav = useNavigate()
  const dispatch = useDispatch()

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    await doLogin()
  }

  const doLogin = async () => {
    console.debug('[Login] submitting', { email })
    try {
      const res = await axios.post('/api/auth/login', { email, password })
      console.debug('[Login] response', res && res.data)
      // backend currently doesn't return expiry; if it did include expiresAt (epoch ms) use it
      const token = res.data.token
      const user = res.data.user
      const expiry = res.data.expiresAt || null
      localStorage.setItem('token', token)
      if (user) localStorage.setItem('user', JSON.stringify(user))
      if (expiry) localStorage.setItem('tokenExpiry', expiry)
      setToken(token)
      scheduleTokenExpiry(expiry ? parseInt(expiry, 10) : null, () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('tokenExpiry')
        dispatch({ type: 'auth/clearAuth' })
        setToken(null)
      })
      dispatch(setAuth({ token, user }))
      nav('/chat')
    } catch (err) {
      console.error('[Login] error', err)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg animate-fade-in">
        <h2 className="text-2xl font-semibold mb-4">Welcome back</h2>
        <form onSubmit={submit} className="space-y-4">
          <input className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-200" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-200" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button type="button" onClick={() => doLogin()} className="w-full bg-indigo-600 text-white px-4 py-2 rounded">Login</button>
        </form>
        <div className="mt-4 text-center text-sm">Don't have an account? <Link to="/signup" className="text-indigo-600 font-medium">Signup</Link></div>
      </div>
    </div>
  )
}
