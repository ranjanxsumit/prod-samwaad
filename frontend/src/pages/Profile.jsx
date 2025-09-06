import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useSelector, useDispatch } from 'react-redux'
import { useSocket } from '../contexts/SocketProvider'
import { setAuth } from '../store/slices/authSlice'

export default function Profile() {
  const user = useSelector(s => s.auth.user)
  const [name, setName] = useState(user?.name || '')
  const avatarOf = (u) => u && (u.avatar || u.avatarUrl || u.image || u.photo || u.avatar_url)
  const normalizeUrl = (u) => {
    if (!u) return ''
    // If avatar stored as object (cloudinary returns object), extract common url fields
    if (typeof u === 'object') {
      if (u.url) u = u.url
      else if (u.secure_url) u = u.secure_url
      else if (u.avatar && typeof u.avatar === 'object') {
        if (u.avatar.url) u = u.avatar.url
        else if (u.avatar.secure_url) u = u.avatar.secure_url
        else return ''
      } else return ''
    }
    if (typeof u !== 'string') return ''
    if (u.startsWith('http') || u.startsWith('//') || u.startsWith('blob:')) return u
    if (u.startsWith('/')) return window.location.origin + u
    return u
  }
  const [avatarPreview, setAvatarPreview] = useState(normalizeUrl(avatarOf(user)) || '')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const dispatch = useDispatch()
  const { socket } = useSocket() || { socket: null }

  useEffect(() => { setName(user?.name || '') }, [user])
  // keep avatarPreview as a normalized string (server may store avatar as an object)
  useEffect(() => { setAvatarPreview(normalizeUrl(avatarOf(user) || '')) }, [user])

  const save = async () => {
    setLoading(true)
    try {
      const form = new FormData()
      form.append('name', name)
      if (file) form.append('avatar', file)
      const res = await axios.patch('/api/users/me/profile', form)
      // After patch, reload canonical user object from server to ensure consistent shape
      let updated = res.data && (res.data.user || res.data) || {}
      try {
        const fresh = await axios.get('/api/users/me')
        updated = fresh.data && (fresh.data.user || fresh.data) || updated
      } catch (e) { /* ignore */ }
      const stored = JSON.parse(localStorage.getItem('user') || 'null')
      const merged = { ...(stored||{}), ...updated }
      // ensure avatar field is present in merged if returned as url
      const newAvatar = (updated.avatar || updated.avatarUrl || updated.image || updated.photo || updated.avatar_url || res.data.url || merged.avatar)
      if (newAvatar) merged.avatar = newAvatar
      localStorage.setItem('user', JSON.stringify(merged))
      dispatch(setAuth({ token: localStorage.getItem('token'), user: merged }))
      if (newAvatar) {
        setAvatarPreview(normalizeUrl(newAvatar))
        try {
          const uid = updated.id || updated._id || merged.id || merged._id || merged.userId
          if (socket && socket.connected) socket.emit('profile-updated', { userId: uid, avatar: newAvatar, name: updated.name || merged.name })
        } catch (e) { /* ignore socket errors */ }
      }
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ paddingTop: '4.5rem' }}>
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded shadow animate-fade-in">
        <h2 className="text-xl font-semibold mb-4">Profile</h2>
        <div className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
            {avatarPreview ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" /> : <div className="text-gray-400">No avatar</div>}
          </div>
          <div>
            <label className="block text-sm mb-1">Change avatar</label>
            <label className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 border rounded cursor-pointer text-sm">
              <span>Choose file</span>
              <input aria-label="Change avatar" type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files && e.target.files[0]
                setFile(f)
                if (f) {
                  // revoke previous object URL if any
                  try { if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview) } catch (err) {}
                  setAvatarPreview(URL.createObjectURL(f))
                }
              }} />
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm">Name</label>
          <input className="w-full p-2 border rounded" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">Email</label>
          <div className="text-sm text-gray-600">{user?.email}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded">{loading? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  </div>
  )
}
