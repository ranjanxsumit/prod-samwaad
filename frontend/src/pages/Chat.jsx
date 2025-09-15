import React, { useEffect, useState, useRef } from 'react'
import { useSocket } from '../contexts/SocketProvider'
import axios from 'axios'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

export default function Chat() {
  const user = useSelector(s => s.auth.user)
  const nav = useNavigate()
  const { socket, addListener, lastIncomingCall } = useSocket() || { socket: null, addListener: () => () => {}, lastIncomingCall: null }

  const [conversations, setConversations] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [showOnlineOnly, setShowOnlineOnly] = useState(false)
  const [selectedUser, setSelectedUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('selectedUser') || 'null') } catch (e) { return null }
  })
  const selectedUserRef = useRef(selectedUser)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])
  const [uploading, setUploading] = useState(false)
  const [pendingImage, setPendingImage] = useState(null)
  const [pendingImagePreview, setPendingImagePreview] = useState('')
  const [incomingCall, setIncomingCall] = useState(null)
  const [outgoingCall, setOutgoingCall] = useState(null) // { to, mode, name, avatar, startedAt }

  const scrollRef = useRef()
  const fileInputRef = useRef()
  const textInputRef = useRef()
  const adminMenuRef = useRef()
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)

  const getId = (v) => {
    if (!v && v !== 0) return undefined
    if (typeof v === 'string' || typeof v === 'number') return String(v)
    const candidate = v && (v.id || v._id || v.userId || (v.user && (v.user.id || v.user._id || v.user.userId)))
    if (!candidate && candidate !== 0) return undefined
    return String(candidate)
  }
  // emit helper: if socket is connected emit immediately, otherwise wait for connect event
  const emitWhenConnected = (event, payload) => {
    try {
      if (!socket) return console.warn('socket not available for emit', event)
      if (socket.connected) {
        try { console.log('emit immediate', event, payload, 'socketId', socket.id); socket.emit(event, payload) } catch (e) { console.warn('emit error', event, e) }
        return
      }
      // wait for a single connect then emit
      const once = () => {
        try { console.log('emit on connect', event, payload, 'socketId', socket.id); socket.emit(event, payload) } catch (e) { console.warn('emit-on-connect error', event, e) }
        try { socket.off('connect', once) } catch (e) {}
      }
      try { socket.on('connect', once) } catch (e) { console.warn('failed to attach connect handler', e) }
    } catch (e) { console.warn('emitWhenConnected error', e) }
  }
  const currentUserId = getId(user)

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
    selectedUserRef.current = selectedUser
  }, [selectedUser])
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

    const loadConvos = async () => {
      try {
        const res = await axios.get('/api/messages/conversations')
        setConversations(res.data.conversations || [])
      } catch (e) { /* ignore */ }
    }
    const loadUsers = async () => {
      try {
        const res = await axios.get('/api/users')
        setAllUsers(res.data.users || res.data || [])
      } catch (e) { /* ignore */ }
    }
    loadConvos()
    loadUsers()

    if (!socket) return

  socket.on('message-received', ({ message }) => {
      try {
        const sel = selectedUserRef.current
        const fromId = getId(message.from) || String(message.from || '')
        const toId = getId(message.to) || String(message.to || '')
        setMessages(m => {
          // correlate with pending temp message
            const idx = m.findIndex(x => x.tempId && (x.tempId === message.tempId || x.id === message.tempId))
            if (idx !== -1) {
              const copy = m.slice();
              copy[idx] = { ...m[idx], ...message, pending: false }
              return copy
            }
          if (sel && (String(fromId) === String(sel.userId) || String(toId) === String(sel.userId))) {
            return [...m, message]
          }
          return m
        })
      } catch (e) { console.warn('message-received handler', e) }
    })

    socket.on('message-sent', ({ message }) => {
      try {
        setMessages(m => {
          const idx = m.findIndex(x => x.tempId && (x.tempId === message.tempId || x.id === message.tempId))
          if (idx !== -1) {
            const copy = m.slice();
            copy[idx] = { ...m[idx], ...message, pending: false }
            return copy
          }
          return m
        })
      } catch (e) { console.warn('message-sent handler', e) }
    })

    socket.on('online-users', (list) => {
      if (!Array.isArray(list)) return
      const normalized = list.map(u => {
        const uid = getId(u) || u.userId || u.id
        if (!uid) return null
        return { ...u, userId: String(uid) }
      }).filter(Boolean)
      setOnlineUsers(normalized)
    })

    // incoming-call now handled via provider addListener to ensure always captured
    const offIncoming = addListener('incoming-call', (data) => {
      try {
        if (!data) return
        console.log('[chat] setting incomingCall state', data)
        setIncomingCall(data)
      } catch (e) { console.warn(e) }
    })

    return () => {
      if (!socket) return
      socket.off('message-received')
      socket.off('online-users')
  offIncoming && offIncoming()
      socket.off('message-sent')
    }
  }, [socket, selectedUser])

  // If we missed the event before effect registered, seed from provider's lastIncomingCall
  useEffect(() => {
    try {
      if (!incomingCall && lastIncomingCall) {
        console.log('[chat] seeding incomingCall from provider cache', lastIncomingCall)
        setIncomingCall(lastIncomingCall)
      }
    } catch (e) { /* ignore */ }
  }, [lastIncomingCall, incomingCall])

  useEffect(() => {
    if (!selectedUser || !selectedUser.userId) return
    const load = async () => {
      try {
        const res = await axios.get(`/api/messages/${selectedUser.userId}?limit=200`)
        const list = (res.data.messages || []).slice().sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        setMessages(list)
      } catch (e) { console.warn('failed to load messages', e) }
    }
    load()
    localStorage.setItem('selectedUser', JSON.stringify(selectedUser))
  }, [selectedUser])

  // navigate into call only after callee accepts (call-accepted). We only listen when we have an outgoingCall.
  useEffect(() => {
    if (!socket || !outgoingCall) return
    const handler = (data) => {
      try {
        if (!data || !data.from) return
        if (String(data.from) === String(outgoingCall.to)) {
          // callee accepted; proceed
          nav(`/call/${outgoingCall.to}?mode=${outgoingCall.mode || 'video'}&init=1`)
          setOutgoingCall(null)
        }
      } catch (e) { console.warn('call-accepted handler error', e) }
    }
    socket.on('call-accepted', handler)
    return () => { try { socket.off('call-accepted', handler) } catch(e){} }
  }, [socket, outgoingCall, nav])

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])

  // if remote party declines, clear outgoingCall modal
  useEffect(() => {
    if (!socket || !outgoingCall) return
    const declined = (data) => {
      try {
        if (data && data.from && String(data.from) === String(outgoingCall.to)) {
          setOutgoingCall(null)
        }
      } catch (e) { /* ignore */ }
    }
    socket.on('call-declined', declined)
    return () => { try { socket.off('call-declined', declined) } catch(e){} }
  }, [socket, outgoingCall])

  useEffect(() => {
    function onDoc(e) { if (!adminMenuRef.current) return; if (!adminMenuRef.current.contains(e.target)) setAdminMenuOpen(false) }
    function onEsc(e) { if (e.key === 'Escape') setAdminMenuOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  function relativeTime(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

  const send = async () => {
    if (!selectedUser) return
    const to = selectedUser.userId
    if (!text.trim() && !pendingImage) return
    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const tmp = { id: clientId, tempId: clientId, from: { id: user?._id || user?.id || 'me', name: 'You' }, to, text: text.trim() || undefined, image: pendingImagePreview || undefined, createdAt: new Date().toISOString(), pending: true }
    setMessages(m => [...m, tmp])

    try {
      if (pendingImage) {
        setUploading(true)
        const fd = new FormData()
        fd.append('to', to)
        fd.append('image', pendingImage)
        if (text.trim()) fd.append('text', text.trim())
        await axios.post('/api/messages', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        setUploading(false)
      } else {
        await axios.post('/api/messages', { to, text: text.trim() })
      }
    } catch (err) {
        // If server call fails, fallback to emitting via socket so recipient still receives it
        if (socket && socket.connected) socket.emit('send-message', { to, text: text.trim(), clientId })
      setUploading(false)
    }

    // Always emit over socket so server/recipient and this client receive live updates
    try { if (socket && socket.connected) socket.emit('send-message', { to, text: text.trim(), clientId }) } catch (e) { /**/ }

    setText('')
    if (pendingImagePreview) try { URL.revokeObjectURL(pendingImagePreview) } catch (e) {}
    setPendingImage(null)
    setPendingImagePreview('')
  }

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file || !selectedUser) { e.target.value = ''; return }
    try { const preview = URL.createObjectURL(file); setPendingImage(file); setPendingImagePreview(preview) } catch (err) { console.warn('failed to read file', err); setPendingImage(null); setPendingImagePreview('') }
    e.target.value = ''
  }

  const removePendingImage = () => { if (pendingImagePreview) try { URL.revokeObjectURL(pendingImagePreview) } catch (e) {}; setPendingImage(null); setPendingImagePreview('') }

  // UI
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <style>{`
        .chat-bubble { position: relative; border-radius: 12px; }
        .chat-bubble.sent { background: linear-gradient(180deg,#06a763,#0da96a); color: #fff; }
        .chat-bubble.received { background: #2563EB; color: #fff; }
        .chat-bubble.received .time-pill { background: rgba(0,0,0,0.18); color: rgba(255,255,255,0.95); }
        .time-pill { background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 12px; font-size: 12px; color: rgba(255,255,255,0.95); }
        .tick { font-size: 12px; margin-left:6px; opacity:0.9 }
        .max-w-chat { max-width: 560px; }
        @media (max-width: 640px) { .max-w-chat { max-width: 90%; } }
      `}</style>

      {(incomingCall || outgoingCall) && (
        <div className="fixed left-1/2 transform -translate-x-1/2 top-28 z-[999]">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 px-5 py-4 flex items-center gap-5 min-w-[360px]">
            {incomingCall && (
              <>
                <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center text-lg font-semibold">
                  {normalizeAvatar(incomingCall.avatar) ? <img src={normalizeAvatar(incomingCall.avatar)} alt="caller" className="w-full h-full object-cover" /> : (incomingCall.name ? incomingCall.name[0].toUpperCase() : '?')}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{incomingCall.name || 'Incoming call'}</div>
                  <div className="text-xs text-gray-500">{incomingCall.mode === 'audio' ? 'Voice call' : 'Video call'}</div>
                  <div className="mt-1 text-[11px] text-emerald-600 animate-pulse">Ringing…</div>
                </div>
                <div className="flex items-center gap-3">
                  <button title="Accept" onClick={() => {
                    try { localStorage.setItem('pendingCallAccept', incomingCall.from) } catch (err) { /* ignore */ }
                    try { emitWhenConnected('call-accept', { to: incomingCall.from }) } catch (e) { console.warn(e) }
                    try { nav(`/call/${incomingCall.from}?mode=${incomingCall.mode || 'video'}`) } catch (e) { console.warn(e) }
                    setIncomingCall(null)
                  }} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full text-sm font-medium shadow">
                    <span className="text-base">✅</span><span>Pickup</span>
                  </button>
                  <button title="Decline" onClick={() => { try { if (socket && socket.connected) socket.emit('call-decline', { to: incomingCall.from }) } catch (e) { console.warn(e) } setIncomingCall(null) }} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full text-sm font-medium shadow">
                    <span className="text-base">✖️</span><span>Decline</span>
                  </button>
                </div>
              </>
            )}
            {outgoingCall && !incomingCall && (
              <>
                <div className="w-14 h-14 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center text-lg font-semibold">
                  {normalizeAvatar(outgoingCall.avatar) ? <img src={normalizeAvatar(outgoingCall.avatar)} alt="callee" className="w-full h-full object-cover" /> : (outgoingCall.name ? outgoingCall.name[0].toUpperCase() : '?')}
                </div>
                <div className="flex-1">
                  <div className="font-medium">Calling {outgoingCall.name || outgoingCall.to}</div>
                  <div className="text-xs text-gray-500">{outgoingCall.mode === 'audio' ? 'Voice call' : 'Video call'}</div>
                  <div className="mt-1 text-[11px] text-indigo-600 animate-pulse">Ringing…</div>
                </div>
                <div className="flex items-center gap-2">
                  <button title="Cancel" onClick={() => { const target = outgoingCall.to; setOutgoingCall(null); try { if (socket && socket.connected) socket.emit('call-decline', { to: target }) } catch(e){} }} className="w-11 h-11 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center shadow">✖️</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Debug overlay (remove in production if not needed) */}
      <div className="fixed bottom-2 left-2 z-50 text-[10px] bg-black/50 text-white px-2 py-1 rounded pointer-events-none">
        <div>incoming: {incomingCall ? JSON.stringify({ from: incomingCall.from, mode: incomingCall.mode }) : 'none'}</div>
        <div>outgoing: {outgoingCall ? JSON.stringify({ to: outgoingCall.to, mode: outgoingCall.mode }) : 'none'}</div>
      </div>

      <div className="fixed inset-0 flex items-start justify-center p-4">
        <div className="w-full max-w-6xl h-[calc(100vh-2rem)] grid grid-cols-12 gap-4 bg-white rounded-md shadow p-4 overflow-hidden relative" style={{ paddingTop: '4rem' }}>

          {/* App logo + admin pill */}
          <div className="absolute top-4 left-4 z-30 flex items-center gap-3" ref={adminMenuRef}>
            <img src="/samwaad.svg" alt="app logo" className="w-10 h-10" />
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setAdminMenuOpen(s => !s) }} className="inline-flex items-center gap-2 bg-white rounded-full px-3 py-1 shadow-sm focus:outline-none">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-indigo-500 text-white flex items-center justify-center">
                  {user && normalizeAvatar(user.avatar) ? <img src={normalizeAvatar(user.avatar)} alt="me" className="w-full h-full object-cover" /> : (user && user.name ? user.name[0].toUpperCase() : 'A')}
                </div>
                <div className="text-sm font-medium">{user?.name || 'Me'}</div>
              </button>
              {adminMenuOpen && (
                <div role="menu" className="absolute left-0 mt-2 w-44 bg-white rounded shadow-lg ring-1 ring-black ring-opacity-5 py-2 z-50">
                  <button onClick={() => { setAdminMenuOpen(false); nav('/profile') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">View / Update profile</button>
                  <button onClick={() => { setAdminMenuOpen(false); localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('tokenExpiry'); window.location.href = '/' }} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50">Logout</button>
                </div>
              )}
            </div>
          </div>

          {/* Right-aligned selected user pill (above chat box, doesn't cross left grey line) */}
          <div className="absolute top-6 right-8 z-40 w-full max-w-md px-4 pointer-events-none">
            <div className="pointer-events-auto flex justify-end">
              <div className="inline-flex items-center gap-4 bg-white/95 backdrop-blur-sm text-gray-900 rounded-full px-4 py-2 shadow-md min-w-[200px] w-full">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  {selectedUser && normalizeAvatar(selectedUser.avatar) ? <img src={normalizeAvatar(selectedUser.avatar)} alt="avatar" className="w-full h-full object-cover" /> : (selectedUser && selectedUser.name ? selectedUser.name[0].toUpperCase() : 'U')}
                </div>
                <div className="text-base font-semibold">{selectedUser ? selectedUser.name : 'Select a chat'}</div>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        <button
                  title="Video call"
                  onClick={() => {
                    if (!selectedUser) return
                    const targetId = selectedUser.userId
                    // prevent self-call
                    if (currentUserId && String(targetId) === String(currentUserId)) { console.warn('Cannot call yourself'); return }
                    // prevent duplicate rapid clicks
                    if (outgoingCall && String(outgoingCall.to) === String(targetId)) { console.warn('Call already ringing'); return }
                    setOutgoingCall({ to: targetId, mode: 'video', name: selectedUser.name, avatar: selectedUser.avatar, startedAt: Date.now() })
                    try { emitWhenConnected('call-init', { to: targetId, mode: 'video' }) } catch (e) { console.warn('call-init emit', e) }
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
                >📹</button>
        <button
                  title="Voice call"
                  onClick={() => {
                    if (!selectedUser) return
                    const targetId = selectedUser.userId
                    if (currentUserId && String(targetId) === String(currentUserId)) { console.warn('Cannot call yourself'); return }
                    if (outgoingCall && String(outgoingCall.to) === String(targetId)) { console.warn('Call already ringing'); return }
                    setOutgoingCall({ to: targetId, mode: 'audio', name: selectedUser.name, avatar: selectedUser.avatar, startedAt: Date.now() })
                    try { emitWhenConnected('call-init', { to: targetId, mode: 'audio' }) } catch (e) { console.warn('call-init emit', e) }
                  }}
                  className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center"
                >📞</button>
              </div>
              </div>
            </div>
          </div>

          {/* Left: users list (no online-avatar strip) */}
          <aside className="col-span-12 md:col-span-4 lg:col-span-4 bg-white border-r overflow-auto h-full">
            <div className="p-4 border-b">
              <div className="w-full flex items-center justify-start">
                <div className="inline-flex items-center gap-4 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
                  <h2 className="text-sm font-semibold pl-1">Users</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowOnlineOnly(false)} className={`px-3 py-1 rounded-full ${!showOnlineOnly ? 'bg-white text-gray-900 shadow-md' : 'bg-gray-50'}`}>All</button>
                    <button onClick={() => setShowOnlineOnly(s => !s)} className={`px-3 py-1 rounded-full ${showOnlineOnly ? 'bg-green-50 text-green-700 shadow-md' : 'bg-white'}`}>Online</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-3">
              <input placeholder="Search users" className="w-full border rounded px-3 py-2" />
            </div>
            <ul className="p-2 space-y-1">
              {(!allUsers || allUsers.length === 0) && conversations.length === 0 && <li className="text-sm text-gray-500 p-2">No users</li>}
              {showOnlineOnly && onlineUsers.length === 0 && <li className="text-sm text-gray-500 p-2">No online users</li>}

              {
                (() => {
                  const list = showOnlineOnly
                    ? onlineUsers.map(u => ({ userId: getId(u) || String(u.userId || ''), name: u.name || 'Unknown', avatar: avatarOf(u), role: u.role }))
                    : (allUsers.length ? allUsers.map(u => ({ userId: getId(u) || String(u.userId || ''), name: u.name || u.username || 'Unknown', avatar: avatarOf(u), role: u.role })) : conversations.map(c => ({ userId: getId(c) || String(c.userId || ''), name: c.name, avatar: avatarOf(c), role: c.role })))
                  return list
                    .filter(u => u.role !== 'admin')
                    .map(u => (
                      <li key={u.userId} onClick={() => setSelectedUser({ userId: u.userId, name: u.name, avatar: u.avatar })} className={`flex items-center gap-3 p-3 rounded hover:bg-gray-50 cursor-pointer ${selectedUser && selectedUser.userId === u.userId ? 'bg-gray-50' : ''}`}>
                        <div className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center overflow-hidden">
                          {normalizeAvatar(u.avatar) ? <img src={normalizeAvatar(u.avatar)} alt="avatar" className="w-full h-full object-cover" /> : (u.name ? u.name[0].toUpperCase() : '?')}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{u.name}</div>
                          {
                            (() => {
                              const isOnline = onlineUsers && onlineUsers.find(x => String(x.userId) === String(u.userId))
                              return (
                                <div className={`text-sm truncate ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                                  {isOnline ? 'Online' : 'Offline'}
                                </div>
                              )
                            })()
                          }
                        </div>
                      </li>
                    ))
                })()
              }
            </ul>
          </aside>

          {/* Main: chat area */}
          <main className="col-span-12 md:col-span-8 lg:col-span-8 flex flex-col min-h-0 h-full">
            <div className="h-28" />

            <div className="w-full">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
                <div className="bg-white rounded-lg shadow p-4">
                  <div ref={scrollRef} className="overflow-auto p-4 max-h-[60vh] md:max-h-[calc(100vh-18rem)]" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
                    <div className="max-w-3xl mx-auto flex flex-col gap-4">
                      {messages.map((m, i) => {
                        const fromId = getId(m.from || m.sender || m.fromId)
                        const isMine = currentUserId && (fromId === currentUserId)
                        const getImageSrc = (img) => { if (!img) return null; if (typeof img === 'string') return img; if (typeof img === 'object') return img.url || img.secure_url || (img.image && (img.image.url || img.image.secure_url)) || null; return null }
                        const imageSrc = getImageSrc(m.image)
                        return (
                          <div key={m.id || i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`chat-bubble ${isMine ? 'sent' : 'received'} max-w-chat px-4 py-3`}>
                              {imageSrc && <img src={imageSrc} alt="img" className="w-64 max-w-full rounded mb-2" />}
                              {(!imageSrc && m.image) && <div className="text-xs text-gray-300 italic mb-2">[image]</div>}
                              {m.text && <div className="text-sm leading-relaxed">{m.text}</div>}
                              <div className="flex items-center justify-end gap-2 mt-2">
                                <div className="time-pill">{relativeTime(m.createdAt)}</div>
                                {isMine && <div className="tick">{m.read ? '✓✓' : m.delivered ? '✓✓' : (m.pending ? '...' : '✓')}</div>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* sticky input placed above the bottom grey border */}
                  <div className="border-t px-4 py-3 bg-white">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 flex justify-center md:justify-end">
                      <div className="w-full max-w-3xl relative flex items-center justify-end">
                        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-md w-full">
                          <div className="flex items-center gap-2 px-2">
                            <button onClick={() => { const emoji = '😊'; setText(t => (t || '') + emoji); if (textInputRef.current) textInputRef.current.focus() }} className="p-2 text-xl" title="Insert emoji">😊</button>
                            <button onClick={onPickFile} className="p-2 text-xl">📎</button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                          </div>
                          {pendingImagePreview && (
                            <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2 mr-2">
                              <img src={pendingImagePreview} alt="preview" className="w-20 h-12 object-cover rounded" />
                              <div className="flex flex-col">
                                <div className="text-sm">Image ready to send</div>
                                <button onClick={removePendingImage} className="text-xs text-red-500 mt-1">Remove</button>
                              </div>
                            </div>
                          )}
                          <input ref={textInputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder={selectedUser ? `Message ${selectedUser.name}` : 'Select a conversation'} className="flex-1 px-6 py-3 rounded-full focus:outline-none text-sm" />
                          <button onClick={send} disabled={!selectedUser || (!text.trim() && !pendingImage) || uploading} className="ml-3 bg-emerald-500 text-white p-3 rounded-full disabled:opacity-50">{uploading ? '...' : '➡️'}</button>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </main>

        </div>
      </div>
    </div>
  )
}

