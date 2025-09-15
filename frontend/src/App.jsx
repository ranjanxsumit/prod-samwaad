import React from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import Call from './pages/Call'
import { useDispatch, useSelector } from 'react-redux'
import { clearAuth, setAuth } from './store/slices/authSlice'
import { useEffect } from 'react'
import HeaderSimple from './components/HeaderSimple'
import { SocketProvider } from './contexts/SocketProvider'
import { setToken, scheduleTokenExpiry, clearScheduledExpiry } from './utils/auth'
import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children }) {
  const token = useSelector(s => s.auth.token)
  if (!token) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const dispatch = useDispatch()
  const nav = useNavigate()

  useEffect(() => {
    // bootstrap auth from localStorage
    const token = localStorage.getItem('token')
    const user = localStorage.getItem('user')
    const tokenExpiry = localStorage.getItem('tokenExpiry')
    if (token) {
      dispatch(setAuth({ token, user: user ? JSON.parse(user) : null }))
      setToken(token)
      scheduleTokenExpiry(tokenExpiry ? parseInt(tokenExpiry, 10) : null, () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        localStorage.removeItem('tokenExpiry')
        dispatch(clearAuth())
        clearScheduledExpiry()
        // navigation to login handled by auth state change
      })
    }
  }, [dispatch])

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  localStorage.removeItem('tokenExpiry')
    dispatch(clearAuth())
  setToken(null)
  clearScheduledExpiry()
    nav('/')
  }

  const token = useSelector(s => s.auth.token)

  const user = useSelector(s => s.auth.user)

  return (
    <div className="min-h-screen bg-transparent">
  <HeaderSimple />
  <SocketProvider>
  <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <Routes>
          <Route path="/" element={token ? <Navigate to="/chat" replace /> : <Login />} />
          <Route path="/signup" element={token ? <Navigate to="/chat" replace /> : <Signup />} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/call/:id" element={<ProtectedRoute><Call /></ProtectedRoute>} />
          {/* Catch-all: redirect unknown client routes to home so SPA handles routing (prevents 404 on direct links) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      </SocketProvider>
    </div>
  )
}
