import React, { useState } from 'react'
import axios from 'axios'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setAuth } from '../store/slices/authSlice'
import { setToken, scheduleTokenExpiry } from '../utils/auth'

export default function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [serverError, setServerError] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const nav = useNavigate()
  const dispatch = useDispatch()

  const submit = async (e) => {
    e.preventDefault()
    // client-side validation for password creation criteria
    if (!password || password.length < 8) {
      setPasswordError('Password must be at least 8 characters long')
      return
    }
    setPasswordError('')
    setServerError('')

    let res
    try {
      res = await axios.post('/api/auth/signup', { name, email, password })
    } catch (err) {
      // show server-side errors (zod or duplicate email etc.)
      const msg = err?.response?.data?.message || err.message || 'Signup failed'
      setServerError(String(msg))
      return
    }
    const token = res.data.token
    let user = res.data.user
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
    // if an avatar was chosen, upload it using the profile endpoint
    try {
      if (avatarFile) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
        const fd = new FormData()
        fd.append('avatar', avatarFile)
        const up = await axios.patch('/api/users/me/profile', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        if (up.data && up.data.user) {
          user = up.data.user
          localStorage.setItem('user', JSON.stringify(user))
          dispatch(setAuth({ token, user }))
        }
      }
    } catch (err) {
      console.warn('avatar upload failed', err)
    }

    nav('/chat')
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg animate-fade-in">
        <h2 className="text-2xl font-semibold mb-4">Create account</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
              {avatarPreview ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" /> : (name ? name[0].toUpperCase() : 'U')}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium">Profile picture (optional)</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="file" accept="image/*" id="signup-avatar" onChange={e=>{
                  const f = e.target.files && e.target.files[0]
                  if (!f) return
                  try { const url = URL.createObjectURL(f); setAvatarFile(f); setAvatarPreview(url) } catch (err) { setAvatarFile(null); setAvatarPreview('') }
                }} />
                {avatarPreview && <button type="button" className="text-sm text-red-500" onClick={()=>{ try{ if (avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview) }catch(e){} setAvatarFile(null); setAvatarPreview('') }}>Remove</button>}
              </div>
            </div>
          </div>
          <input className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-200" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <input className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-200" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <div>
            <input
              className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-200"
              placeholder="Password"
              type="password"
              value={password}
              onChange={e=>{
                const v = e.target.value
                setPassword(v)
                if (!v || v.length < 8) setPasswordError('Password must be at least 8 characters long')
                else setPasswordError('')
              }}
              aria-invalid={!!passwordError}
            />
            {passwordError && <div className="text-sm text-red-600 mt-1">{passwordError}</div>}
          </div>
          {serverError && <div className="text-sm text-red-600">{serverError}</div>}
          <button
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={!name.trim() || !email.trim() || !!passwordError}
          >Signup</button>
        </form>
        <div className="mt-4 text-center text-sm">Already have an account? <Link to="/" className="text-indigo-600 font-medium">Login</Link></div>
      </div>
    </div>
  )
}
