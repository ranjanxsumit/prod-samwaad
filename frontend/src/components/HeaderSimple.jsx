import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { clearAuth } from '../store/slices/authSlice'
import { setToken, clearScheduledExpiry } from '../utils/auth'

export default function HeaderSimple() {
  const user = useSelector(s => s.auth.user)
  const navigate = useNavigate()
  // no user menu here; the app shows a centered user pill in chat

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

  <div className="flex-1" />
      </div>
    </header>
  )
}
