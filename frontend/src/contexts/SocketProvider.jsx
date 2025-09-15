import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import io from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const socketRef = useRef(null)
  const [status, setStatus] = useState('disconnected')
  const [lastIncomingCall, setLastIncomingCall] = useState(null)
  const listenersRef = useRef({}) // { event: Set(callback) }

  const addListener = useCallback((event, cb) => {
    if (!event || typeof cb !== 'function') return () => {}
    if (!listenersRef.current[event]) listenersRef.current[event] = new Set()
    listenersRef.current[event].add(cb)
    return () => { try { listenersRef.current[event].delete(cb) } catch (e) {} }
  }, [])

  const emitLocal = useCallback((event, payload) => {
    try {
      const set = listenersRef.current[event]
      if (set) for (const cb of Array.from(set)) { try { cb(payload) } catch (e) { /* ignore */ } }
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
  // Prefer runtime override `window.__API_URL`, then VITE_API_URL at build time. In development
  // fallback to localhost:3000. In production, if none is provided, use relative origin so
  // socket connects to same host. This mirrors axios runtime override logic so API and sockets
  // talk to the same backend.
  let serverUrl = ''
  try { if (typeof window !== 'undefined' && window.__API_URL) serverUrl = window.__API_URL } catch (e) {}
  if (!serverUrl) serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')
    // if there's an existing socket, disconnect it first so we re-auth with new token
    if (socketRef.current) {
      try { socketRef.current.disconnect() } catch (e) {}
      socketRef.current = null
    }

    // If serverUrl is empty string, io() will connect to same origin which is desired in many deployments
    const s = io(serverUrl, { path: '/socket.io', transports: ['websocket'], auth: { token } })
    socketRef.current = s
    console.log('SocketProvider connecting to', serverUrl)
    s.on('connect', () => setStatus('connected'))
    s.on('disconnect', () => setStatus('disconnected'))
    s.on('connect_error', (err) => { console.warn('socket connect_error', err && err.message); setStatus('error') })
    // global call related events
    s.on('incoming-call', (data) => { console.log('[socket] incoming-call', data); setLastIncomingCall(data); emitLocal('incoming-call', data) })
    s.on('call-accepted', (data) => { console.log('[socket] call-accepted', data); emitLocal('call-accepted', data) })
    s.on('call-declined', (data) => { console.log('[socket] call-declined', data); emitLocal('call-declined', data) })
    s.on('signal-offer', (data) => { emitLocal('signal-offer', data) })
    s.on('signal-answer', (data) => { emitLocal('signal-answer', data) })
    s.on('signal-ice', (data) => { emitLocal('signal-ice', data) })

    return () => {
      try {
        if (socketRef.current) {
          const s = socketRef.current
          try { s.off('incoming-call') } catch (e) {}
          try { s.off('call-accepted') } catch (e) {}
          try { s.off('call-declined') } catch (e) {}
          try { s.off('signal-offer') } catch (e) {}
          try { s.off('signal-answer') } catch (e) {}
          try { s.off('signal-ice') } catch (e) {}
          s.disconnect()
        }
      } catch (e) {}
      socketRef.current = null
    }
  }, [localStorage.getItem('token')])

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, status, lastIncomingCall, addListener }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}

export default SocketContext
