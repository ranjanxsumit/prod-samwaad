import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { clearAuth } from '../store/slices/authSlice'
import { setToken, clearScheduledExpiry } from '../utils/auth'

export default function HeaderSimple() {
  const user = useSelector(s => s.auth.user)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  const avatarOf = (u) => u && (u.avatar || u.avatarUrl || u.image || u.photo || u.avatar_url)
  const normalizeAvatar = (v) => {
    if (!v) return ''
    if (typeof v === 'object') return v.url || v.secure_url || ''
    return v
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <a href="https://prod-samwaad.onrender.com" aria-label="Go to production site" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white flex items-center justify-center shadow-sm">
              <img src="/samwaad.svg" alt="Samwaad" className="w-full h-full object-cover" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-indigo-600">Samwaad</div>
              <div className="text-xs text-gray-400">Real-time chat & calls</div>
            </div>
          </a>
        </div>

        <div className="flex items-center gap-3" ref={wrapRef}>
          {user && (
            <div className="relative">
              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(s => !s) }} className="flex items-center gap-3 px-2 py-1 rounded-full hover:shadow-md" title="Edit profile">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">
                  {normalizeAvatar(avatarOf(user)) ? <img src={normalizeAvatar(avatarOf(user))} alt="profile" className="w-full h-full object-cover" /> : (user.name ? user.name[0].toUpperCase() : 'U')}
                </div>
                <div className="hidden sm:block text-sm">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-gray-400">Account</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white rounded shadow-lg ring-1 ring-black ring-opacity-5 py-2 z-40">
                  <button onClick={() => { setMenuOpen(false); navigate('/profile') }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">View profile</button>
                  <button onClick={() => {
                    try {
                      localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('tokenExpiry')
                      dispatch(clearAuth())
                      setToken(null)
                      clearScheduledExpiry()
                      setMenuOpen(false)
                      navigate('/')
                    } catch (e) { console.warn('logout', e) }
                  }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50">Logout</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
