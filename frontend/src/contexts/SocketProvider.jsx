import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const socketRef = useRef(null)
  const [status, setStatus] = useState('disconnected')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    // Prefer explicit VITE_API_URL. In development fallback to localhost:3000. In production, if
    // VITE_API_URL is not provided, use relative origin (empty string) so socket connects to same host.
    const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '')
    // if there's an existing socket, disconnect it first so we re-auth with new token
    if (socketRef.current) {
      try { socketRef.current.disconnect() } catch (e) {}
      socketRef.current = null
    }

    // If serverUrl is empty string, io() will connect to same origin which is desired in many deployments
    socketRef.current = io(serverUrl, { path: '/socket.io', transports: ['websocket'], auth: { token } })
    socketRef.current.on('connect', () => setStatus('connected'))
    socketRef.current.on('disconnect', () => setStatus('disconnected'))
    socketRef.current.on('connect_error', () => setStatus('error'))

    return () => {
      try { if (socketRef.current) socketRef.current.disconnect() } catch (e) {}
      socketRef.current = null
    }
  }, [localStorage.getItem('token')])

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, status }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}

export default SocketContext
