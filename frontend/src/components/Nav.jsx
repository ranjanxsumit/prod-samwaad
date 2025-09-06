import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Nav({ user, onLogout }) {
  const navigate = useNavigate()
  const pillRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const rafRef = useRef(null)
  const baseCenterRef = useRef({ cx: null, cy: null, w: 0, h: 0 })
  const [openChats, setOpenChats] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)

  // avatar helpers to handle string or Cloudinary-style object
  const avatarOf = (u) => u && (u.avatar || u.avatarUrl || u.image || u.photo || u.avatar_url)
  const normalizeAvatar = (v) => {
    if (!v) return ''
    if (typeof v === 'object') {
      if (v.url) v = v.url
      else if (v.secure_url) v = v.secure_url
      else if (v.avatar && typeof v.avatar === 'object') {
        if (v.avatar.url) v = v.avatar.url
        else if (v.avatar.secure_url) v = v.avatar.secure_url
        else return ''
      } else return ''
    }
    if (typeof v !== 'string') return ''
    if (v.startsWith('http') || v.startsWith('//') || v.startsWith('blob:')) return v
    if (v.startsWith('/')) return window.location.origin + v
    return v
  }

  useEffect(() => {
    // fetch online count (simple) so nav can show activity
    let cancelled = false
    const token = localStorage.getItem('token')
    if (token) {
      axios.get('/api/users/online').then(r => {
        if (cancelled) return
        setOnlineCount(Array.isArray(r.data) ? r.data.length : 0)
      }).catch(() => {})
    }

    return () => { cancelled = true }
  }, [])

  // close menus on outside click or Escape
  useEffect(() => {
    function onDocClick(e) {
      if (!pillRef.current) return
      if (!pillRef.current.contains(e.target)) {
        setOpenChats(false)
        setUserMenuOpen(false)
      }
    }
    function onEsc(e) { if (e.key === 'Escape') { setOpenChats(false); setUserMenuOpen(false) } }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onEsc) }
  }, [])

  function handleMove(e) {
    const el = pillRef.current
    if (!el) return
    // use precomputed center (from mouse enter) to avoid jitter caused by transforms
    let { cx, cy, w, h } = baseCenterRef.current || {}
    if (!cx || !cy || !w || !h) {
      const rect = el.getBoundingClientRect()
      cx = rect.left + rect.width / 2
      cy = rect.top + rect.height / 2
      w = rect.width
      h = rect.height
      baseCenterRef.current = { cx, cy, w, h }
    }
    const dx = (e.clientX - cx) / w
    const dy = (e.clientY - cy) / h
    // reduce multiplier and clamp so movement is subtle and stable
    const tx = Math.max(-8, Math.min(8, dx * 4))
    const ty = Math.max(-8, Math.min(8, dy * -4))
    // smooth via rAF and CSS variables
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      try { if (pillRef.current) pillRef.current.style.setProperty('--tx', `${tx}px`); pillRef.current.style.setProperty('--ty', `${ty}px`) } catch(e){}
    })
  }

  function handleLeave() { cancelAnimationFrame(rafRef.current); if (pillRef.current) { pillRef.current.style.setProperty('--tx', `0px`); pillRef.current.style.setProperty('--ty', `0px`) } setOpenChats(false) }

  function handleEnter() {
    const el = pillRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    baseCenterRef.current = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, w: rect.width, h: rect.height }
  }

  return (
    // fixed top nav with slightly larger mobile offset and higher z so popups stay above page content
  <nav role="navigation" aria-label="Main navigation" className="fixed inset-x-0 top-10 sm:top-8 md:top-6 z-50">
  <div className="max-w-6xl mx-auto flex justify-start px-4 sm:px-6 md:px-8 pointer-events-auto">
          <div
            ref={pillRef}
            onMouseEnter={handleEnter}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            className="inline-flex items-center gap-4 bg-white/95 backdrop-blur-sm rounded-full shadow-sm px-3 py-1 transition-transform duration-200"
            style={{ transform: 'translate3d(var(--tx,0), var(--ty,0), 0) scale(var(--s,1))' }}
            aria-hidden="false"
          >
            {/* Brand logo + tagline inside pill */}
            <a href="https://prod-samwaad.onrender.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-2 py-1 rounded-full" aria-label="Open production site">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-white flex items-center justify-center shadow-sm">
                <img src="/samwaad.svg" alt="Samwaad logo" className="w-full h-full object-cover" onError={(e)=>{ try{ e.target.onerror=null; e.target.src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%236366F1"/><path d="M8 12c1.333-2 3-3 4-3s2.667 1 4 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 15c1.333-1.333 3-2 4-2s2.667.667 4 2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' } catch(e){} }} />
              </div>
              <div className="hidden md:flex flex-col leading-tight">
                <div className="text-sm font-semibold text-indigo-600">Samwaad</div>
                <div className="text-xs text-gray-400">Real-time chat & calls</div>
              </div>
            </a>
            {/* Profile pill (click to open user menu) */}
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setUserMenuOpen(s => !s) }}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                title="Profile"
                aria-label="Profile menu"
                className="flex items-center gap-3 px-3 py-2 rounded-full hover:shadow-md hover:bg-indigo-50 transition-all"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 overflow-hidden" title={user?.name || 'Profile'}>
                  {normalizeAvatar(avatarOf(user)) ? (
                    <img src={normalizeAvatar(avatarOf(user))} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    (user && user.name ? user.name[0].toUpperCase() : 'U')
                  )}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-sm font-medium">{user ? user.name : 'Profile'}</span>
                  <span className="text-xs text-gray-400">Account</span>
                </div>
              </button>
              {userMenuOpen && (
                <div role="menu" className="absolute left-1/2 transform -translate-x-1/2 mt-2 w-56 bg-white rounded shadow-lg ring-1 ring-black ring-opacity-5 py-3 z-50">
                  <div className="px-4">
                    <div className="text-sm font-semibold">{user?.name}</div>
                    <div className="text-xs text-gray-500">{user?.email}</div>
                  </div>
                  <div className="mt-3 px-4">
                    <button onClick={() => { setUserMenuOpen(false); navigate('/profile') }} className="block text-sm text-indigo-600 hover:underline mb-2 text-left">View profile</button>
                    <button onClick={() => { setUserMenuOpen(false); onLogout && onLogout() }} className="w-full text-left bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded">Logout</button>
                  </div>
                </div>
              )}
            </div>

            {/* removed Online and Chats dropdown as requested */}
          </div>

          {/* ARIA live region for screen readers announcing active user count changes */}
          <div aria-live="polite" className="sr-only">{`Active users ${onlineCount}`}</div>
        </div>
      </nav>
  )
}
