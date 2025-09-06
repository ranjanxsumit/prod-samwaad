import React, { useEffect, useState, useRef } from 'react'
import { useSocket } from '../contexts/SocketProvider'
import axios from 'axios'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

export default function Chat() {
  const user = useSelector(s => s.auth.user)
  const nav = useNavigate()
  const { socket, status } = useSocket() || { socket: null, status: 'disconnected' }

  const [conversations, setConversations] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [showOnlineOnly, setShowOnlineOnly] = useState(false)
  const [selectedUser, setSelectedUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('selectedUser') || 'null') } catch (e) { return null }
  })
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])
  const [uploading, setUploading] = useState(false)
  const [pendingImage, setPendingImage] = useState(null)
  const [pendingImagePreview, setPendingImagePreview] = useState('')
  const [incomingCall, setIncomingCall] = useState(null) // { from, name, avatar, mode }

  const scrollRef = useRef()
  const fileInputRef = useRef()
  const textInputRef = useRef()
  const adminMenuRef = useRef()
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)

  // helper to extract id from different shapes and always return a string (or undefined)
  const getId = (v) => {
    if (!v && v !== 0) return undefined
    // primitive id (string or number)
    if (typeof v === 'string' || typeof v === 'number') return String(v)
    // object shapes
    const candidate = v.id || v._id || v.userId || (v.user && (v.user.id || v.user._id || v.user.userId))
    if (!candidate && candidate !== 0) return undefined
    return String(candidate)
  }
  const currentUserId = getId(user)

  // Avatar helpers: extract possible avatar fields and normalize to string URL
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
      setMessages(m => selectedUser && (message.from?.id === selectedUser.userId || message.to === selectedUser.userId) ? [...m, message] : m)
    })

    // normalize incoming user object to extract stable id
    const normalizeOnlineUser = (u) => {
      if (!u) return null
      const uid = getId(u) || u.userId || u.id
      if (!uid) return null
      return { ...u, userId: String(uid) }
    }

    // add single online user (deduped)
    socket.on('user-online', (u) => {
      const norm = normalizeOnlineUser(u)
      if (!norm) return
      setOnlineUsers(prev => {
        // remove any existing entry with same id, then add to front
        const filtered = prev.filter(p => String(getId(p) || p.userId || p.id) !== norm.userId)
        return [norm, ...filtered]
      })
    })

    // remove offline user by id
    socket.on('user-offline', (u) => {
      const uid = String(getId(u) || u.userId || u.id || '')
      if (!uid) return
      setOnlineUsers(prev => prev.filter(p => String(getId(p) || p.userId || p.id) !== uid))
    })

    // optional bulk sync if the server emits current online users
    socket.on('online-users', (list) => {
      if (!Array.isArray(list)) return
      const normalized = list.map(normalizeOnlineUser).filter(Boolean)
      setOnlineUsers(normalized)
    })

    // request a sync on connect (server may reply with 'online-users' or we fallback to HTTP polling)
    const handleConnect = async () => {
      try {
        // try asking the server for an explicit list
        if (typeof socket.emit === 'function') socket.emit('request-online-users')
        // if server doesn't support it, fallback to HTTP
        const res = await axios.get('/api/users/online')
        if (Array.isArray(res.data)) setOnlineUsers(res.data.map(normalizeOnlineUser).filter(Boolean))
      } catch (e) {
        // ignore fallback errors
      }
    }
    try { socket.on('connect', handleConnect) } catch (e) { }

    // incoming call: show prompt
    try {
      socket.on('incoming-call', (data) => {
        // data: { from, name, avatar, mode }
        try { setIncomingCall(data) } catch (e) { console.warn('incoming-call handler', e) }
      })
    } catch (e) {}

    return () => {
  if (!socket) return
  socket.off('message-received')
  socket.off('user-online')
  socket.off('user-offline')
  socket.off('online-users')
  try { socket.off('connect', handleConnect) } catch (e) { }
    }
  }, [socket])

  useEffect(() => {
    if (!selectedUser || !selectedUser.userId) return
    const load = async () => {
      try {
        const res = await axios.get(`/api/messages/${selectedUser.userId}?limit=200`)
  const list = (res.data.messages || []).slice().sort((a,b)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  setMessages(list)
      } catch (e) { console.warn('failed to load messages', e) }
    }
    load()
    localStorage.setItem('selectedUser', JSON.stringify(selectedUser))
  }, [selectedUser])

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])

  // close admin menu on outside click / Escape
  useEffect(() => {
    function onDoc(e) {
      if (!adminMenuRef.current) return
      if (!adminMenuRef.current.contains(e.target)) setAdminMenuOpen(false)
    }
    function onEsc(e) { if (e.key === 'Escape') setAdminMenuOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [])

  function relativeTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const send = async () => {
    if (!selectedUser) return
    const to = selectedUser.userId

    // If neither text nor an image is present, don't send
    if (!text.trim() && !pendingImage) return

    // create a temporary message for optimistic UI
    const tmp = { id: `tmp-${Date.now()}`, from: { id: user?.id || 'me', name: 'You' }, to, text: text.trim() || undefined, image: pendingImagePreview || undefined, createdAt: new Date().toISOString(), pending: true }
    setMessages(m => [...m, tmp])

    // prepare payload
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
      // fallback to socket if available
      if (socket && socket.connected) {
        if (pendingImage) socket.emit('send-message', { to, text: text.trim() })
        else socket.emit('send-message', { to, text: text.trim() })
      }
      setUploading(false)
    }

    // clear input and pending image after sending
    setText('')
    if (pendingImagePreview) {
      try { URL.revokeObjectURL(pendingImagePreview) } catch (e) { }
    }
    setPendingImage(null)
    setPendingImagePreview('')
  }

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file || !selectedUser) {
      e.target.value = ''
      return
    }
    // store pending file and preview; don't upload yet
    try {
      const preview = URL.createObjectURL(file)
      setPendingImage(file)
      setPendingImagePreview(preview)
    } catch (err) {
      console.warn('failed to read file', err)
      setPendingImage(null)
      setPendingImagePreview('')
    }
    e.target.value = ''
  }

  const removePendingImage = () => {
    if (pendingImagePreview) {
      try { URL.revokeObjectURL(pendingImagePreview) } catch (e) { }
    }
    setPendingImage(null)
    setPendingImagePreview('')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <style>{`
  .chat-bubble { position: relative; border-radius: 12px; }
  .chat-bubble.sent { background: linear-gradient(180deg,#06a763,#0da96a); color: #fff; }
  /* received messages: solid blue block with white text */
  .chat-bubble.received { background: #2563EB; color: #fff; }
  /* time pill inside bubbles: keep high contrast (darker than bubble) */
  .chat-bubble.received .time-pill { background: rgba(0,0,0,0.18); color: rgba(255,255,255,0.95); }
  .time-pill { background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 12px; font-size: 12px; color: rgba(255,255,255,0.95); }
        .tick { font-size: 12px; margin-left:6px; opacity:0.9 }
        /* make chat bubbles wider on larger screens */
        .max-w-chat { max-width: 560px; }
        @media (max-width: 640px) { .max-w-chat { max-width: 90%; } }
      `}</style>
  {/* top floating pill removed; pill will appear inside online-users strip */}
        {/* incoming call prompt */}
        {incomingCall && (
          <div className="fixed left-1/2 transform -translate-x-1/2 top-28 z-60">
            <div className="bg-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100">
                {incomingCall.avatar ? <img src={incomingCall.avatar} alt="caller" className="w-full h-full object-cover" /> : (incomingCall.name ? incomingCall.name[0].toUpperCase() : '?')}
              </div>
              <div>
                <div className="font-medium">{incomingCall.name || 'Incoming call'}</div>
                <div className="text-sm text-gray-500">{incomingCall.mode === 'audio' ? 'Voice call' : 'Video call'}</div>
              </div>
              <div className="ml-4 flex items-center gap-2">
                <button onClick={() => {
                  // accept: emit accept and navigate to call
                  try { if (socket && socket.connected) socket.emit('call-accept', { to: incomingCall.from }) } catch (e) { console.warn('call-accept emit', e) }
                  try { nav(`/call/${incomingCall.from}?mode=${incomingCall.mode || 'video'}`) } catch (e) { console.warn('nav accept', e) }
                  setIncomingCall(null)
                }} className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center">✅</button>
                <button onClick={() => { try { if (socket && socket.connected) socket.emit('call-decline', { to: incomingCall.from }) } catch (e) { console.warn('call-decline emit', e) } setIncomingCall(null) }} className="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center">✖️</button>
              </div>
            </div>
          </div>
    )}

  <div className="fixed inset-0 flex items-start justify-center p-4">
  <div className="w-full max-w-6xl h-[calc(100vh-2rem)] grid grid-cols-12 gap-4 bg-white rounded-md shadow p-4 overflow-hidden relative" style={{ paddingTop: '4rem' }}>
  {/* App logo + admin pill in top-left of white block */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3" ref={adminMenuRef}>
        <img src="/samwaad.svg" alt="app logo" className="w-10 h-10" />
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setAdminMenuOpen(s => !s) }} className="inline-flex items-center gap-2 bg-white rounded-full px-3 py-1 shadow-sm focus:outline-none">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-indigo-500 text-white flex items-center justify-center">
              {user && normalizeAvatar(user.avatar) ? <img src={normalizeAvatar(user.avatar)} alt="me" className="w-full h-full object-cover" /> : (user && user.name ? user.name[0].toUpperCase() : 'A')}
            </div>
            <div className="text-sm font-medium">{user?.name || 'Admin'}</div>
          </button>
          {adminMenuOpen && (
            <div role="menu" className="absolute left-0 mt-2 w-44 bg-white rounded shadow-lg ring-1 ring-black ring-opacity-5 py-2 z-50">
              <button onClick={() => { setAdminMenuOpen(false); nav('/profile') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">View / Update profile</button>
              <button onClick={() => { setAdminMenuOpen(false); nav('/profile') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Change display picture</button>
              <button onClick={() => { setAdminMenuOpen(false); localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('tokenExpiry'); window.location.href = '/' }} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50">Logout</button>
            </div>
          )}
        </div>
      </div>
      {/* Fixed centered user pill */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-40">
        <div className="w-full max-w-3xl px-4">
          <div className="inline-flex items-center justify-center gap-4 bg-white/95 backdrop-blur-sm text-gray-900 rounded-full px-4 py-2 shadow-md min-w-[280px] max-w-[720px] w-full transition-transform duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden">
                {selectedUser && normalizeAvatar(selectedUser.avatar) ? <img src={normalizeAvatar(selectedUser.avatar)} alt="avatar" className="w-full h-full object-cover" /> : (selectedUser && selectedUser.name ? selectedUser.name[0].toUpperCase() : 'U')}
              </div>
              <div className="text-base font-semibold">{selectedUser ? selectedUser.name : 'Select a chat'}</div>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <button
                title="Video call"
                aria-label="Start video call"
                onClick={(e) => {
                  e.preventDefault()
                  try {
                    const myId = getId(user)
                    const targetId = selectedUser && selectedUser.userId
                    const canCall = !!targetId && String(myId) !== String(targetId)
                    if (!canCall) return
                    if (socket && socket.connected) {
                      try { socket.emit('call-init', { to: targetId, mode: 'video' }) } catch (emitErr) { console.warn('emit error', emitErr) }
                    }
                    try { nav(`/call/${targetId}?mode=video`) } catch (navErr) { console.warn('navigation error', navErr) }
                  } catch (err) { console.warn('video call error', err) }
                }}
                disabled={!selectedUser || !selectedUser.userId || String(getId(user)) === String(selectedUser.userId)}
                className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm text-base ${(!selectedUser || !selectedUser.userId || String(getId(user)) === String(selectedUser.userId)) ? 'opacity-50' : 'bg-gray-100 text-gray-700'}`}
              >📹</button>
              <button
                title="Voice call"
                aria-label="Start voice call"
                onClick={(e) => {
                  e.preventDefault()
                  try {
                    const myId = getId(user)
                    const targetId = selectedUser && selectedUser.userId
                    const canCall = !!targetId && String(myId) !== String(targetId)
                    if (!canCall) return
                    if (socket && socket.connected) {
                      try { socket.emit('call-init', { to: targetId, mode: 'audio' }) } catch (emitErr) { console.warn('emit error', emitErr) }
                    }
                    try { nav(`/call/${targetId}?mode=audio`) } catch (navErr) { console.warn('navigation error', navErr) }
                  } catch (err) { console.warn('voice call error', err) }
                }}
                disabled={!selectedUser || !selectedUser.userId || String(getId(user)) === String(selectedUser.userId)}
                className={`w-10 h-10 ${(!selectedUser || !selectedUser.userId || String(getId(user)) === String(selectedUser.userId)) ? 'opacity-50' : 'bg-pink-50 text-pink-600'} rounded-full flex items-center justify-center shadow-sm text-base`}
              >📞</button>
            </div>
          </div>
        </div>
      </div>
        {/* Sidebar */}
  <aside className="col-span-12 md:col-span-4 lg:col-span-4 bg-white border-r overflow-auto h-full">
            <div className="p-4 border-b">
              <div className="w-full flex items-center justify-start">
                <div className="inline-flex items-center gap-4 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1 shadow-sm">
                  <h2 className="text-sm font-semibold pl-1">Users</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowOnlineOnly(false)}
                      className={`px-3 py-1 rounded-full transition-shadow duration-150 shadow-sm focus:outline-none ${!showOnlineOnly ? 'bg-white text-gray-900 shadow-md' : 'bg-gray-50 hover:shadow'}`}
                      aria-pressed={!showOnlineOnly}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setShowOnlineOnly(s => !s)}
                      className={`px-3 py-1 rounded-full transition-shadow duration-150 shadow-sm focus:outline-none ${showOnlineOnly ? 'bg-green-50 text-green-700 shadow-md' : 'bg-white hover:shadow'}`}
                      aria-pressed={showOnlineOnly}
                    >
                      Online
                    </button>
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

            {/* choose list: online-users (mapped) or allUsers (fallback to conversations if empty) */}
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
                        {/* show online/offline status instead of 'Has avatar' */}
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

  {/* Main chat */}
  <main className="col-span-12 md:col-span-8 lg:col-span-8 flex flex-col min-h-0 h-full" style={{ margin: '1rem auto' }}>
          {/* Header spacer for new header and fixed pill */}
          <div className="h-28" />

          {/* Messages + online strip */}
          <div className="w-full">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8">
              <div className="flex items-center gap-3 overflow-auto py-2">
                {onlineUsers.length === 0 && <div className="text-sm text-gray-500">No online users</div>}
                {onlineUsers.map(u => {
                  const uid = getId(u) || u.userId || ''
                  return (
                    <button key={uid} onClick={() => setSelectedUser({ userId: uid, name: u.name, avatar: avatarOf(u) })} className="flex flex-col items-center gap-1 px-2 py-1 hover:bg-gray-50 rounded">
                      <div className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center overflow-hidden">
                        {normalizeAvatar(avatarOf(u)) ? <img src={normalizeAvatar(avatarOf(u))} alt="avatar" className="w-full h-full object-cover" /> : (u.name ? u.name[0].toUpperCase() : '?')}
                      </div>
                      <div className="text-xs text-center truncate w-16">{u.name}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-auto p-6 min-h-0" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
              <div className="max-w-3xl mx-auto flex flex-col gap-4">
              {messages.map((m, i) => {
                const fromId = getId(m.from || m.sender || m.fromId)
                const toId = getId(m.to || m.recipient || m.toId)
                const isMine = currentUserId && (fromId === currentUserId)
                // normalize image source: backend may store an object { url, secure_url, format } or a string URL
                const getImageSrc = (img) => {
                  if (!img) return null
                  if (typeof img === 'string') return img
                  if (typeof img === 'object') return img.url || img.secure_url || (img.image && (img.image.url || img.image.secure_url)) || null
                  return null
                }
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
          </div>

          {/* Input - fixed at bottom of white block */}
          <div className="border-t px-4 py-3 sticky bottom-0">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 flex justify-center md:justify-end">
              <div className="w-full max-w-3xl relative flex items-center justify-end">
                <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-md w-full">
                  <div className="flex items-center gap-2 px-2">
                    <button onClick={() => {
                      try {
                        const emoji = '😊'
                        setText(t => (t || '') + emoji)
                        if (textInputRef.current) {
                          textInputRef.current.focus()
                        }
                      } catch(e) { console.warn('emoji insert', e) }
                    }} className="p-2 text-xl" title="Insert emoji">😊</button>
                    <button onClick={onPickFile} className="p-2 text-xl">📎</button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                  </div>
                    {/* image preview (pending) */}
                    {pendingImagePreview && (
                      <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2 mr-2">
                        <img src={pendingImagePreview} alt="preview" className="w-20 h-12 object-cover rounded" />
                        <div className="flex flex-col">
                          <div className="text-sm">Image ready to send</div>
                          <button onClick={removePendingImage} className="text-xs text-red-500 mt-1">Remove</button>
                        </div>
                      </div>
                    )}
                  <input
                    ref={textInputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') send() }}
                    placeholder={selectedUser ? `Message ${selectedUser.name}` : 'Select a conversation'}
                    className="flex-1 px-6 py-3 rounded-full focus:outline-none text-sm"
                  />
                  <button
                    onClick={send}
                      disabled={!selectedUser || (!text.trim() && !pendingImage) || uploading}
                    className="ml-3 bg-emerald-500 text-white p-3 rounded-full disabled:opacity-50"
                  >
                      {uploading ? '...' : '➡️'}
                  </button>
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

