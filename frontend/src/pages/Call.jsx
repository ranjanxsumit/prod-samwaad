import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useSocket } from '../contexts/SocketProvider'
import axios from 'axios'

export default function Call() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const mode = search.get('mode') || 'video'
  const init = search.get('init') === '1'

  const localRef = useRef()
  const remoteRef = useRef()
  const pcRef = useRef(null)
  const socketRef = useRef(null)
  const otherRef = useRef(id)
  const pendingCandidatesRef = useRef([])
  const { socket } = useSocket() || { socket: null }
  const [localStream, setLocalStream] = useState(null)
  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [pcState, setPcState] = useState('new')
  const [iceState, setIceState] = useState('new')
  const [localSdp, setLocalSdp] = useState('')
  const [remoteSdp, setRemoteSdp] = useState('')
  const [localIceCount, setLocalIceCount] = useState(0)
  const [remoteIceCount, setRemoteIceCount] = useState(0)
  const [remoteUserName, setRemoteUserName] = useState('...')
  const [duration, setDuration] = useState(0) // seconds
  const durationRef = useRef(null)
  const [muted, setMuted] = useState(false)
  const [videoDisabled, setVideoDisabled] = useState(false)
  const pushLog = (msg, data) => {
    try {
      const entry = `${new Date().toLocaleTimeString()} - ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`
      setLogs(l => [entry, ...l].slice(0, 60))
      console.log('[call-debug]', entry)
    } catch (e) { console.log('[call-debug] log error', e) }
  }

  useEffect(() => {
    let mounted = true
    const token = localStorage.getItem('token')
    if (!token) return navigate('/login')

    // if provider socket isn't ready yet, wait until it is
    if (!socket) {
      pushLog('waiting for socket from provider')
      return
    }

    // bind provider socket to local ref so other callbacks can use socketRef.current
    const s = socket
    socketRef.current = s

    if (s && typeof s.on === 'function') {
      s.on('connect', () => { console.log('call socket connected', s.id); pushLog('socket connected', s.id) })
    } else {
      console.error('socket not ready for on/connect', s)
      pushLog('socket not ready for connect')
    }
    // if this client just accepted a call from chat, note that we should accept once ready
    let pendingAccept = null
    try { pendingAccept = localStorage.getItem('pendingCallAccept') } catch (e) { pendingAccept = null }
    if (pendingAccept && pendingAccept === id) {
      console.log('will accept incoming call once local media and pc are ready')
      pushLog('pending accept for', pendingAccept)
    }
    if (socketRef.current && typeof socketRef.current.on === 'function') {
      socketRef.current.on('disconnect', () => { console.log('call socket disconnected'); safeEndAndHome('socket disconnected') })
    }

  // signaling handlers
  const sock = s

  // define handlers so we can unregister them on cleanup
  const handleSignalOffer = async (data) => {
      try {
    pushLog('received offer from', data.from)
        otherRef.current = data.from
        const localS = await ensureLocalStream()
        await createPeerConnection(localS)
        const pc = pcRef.current
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        // drain any queued remote candidates that arrived before remoteDescription was set
        if (pendingCandidatesRef.current.length) {
          for (const c of pendingCandidatesRef.current) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); setRemoteIceCount(n => n + 1) } catch (e) { console.warn('drain addIceCandidate failed', e) }
          }
          pendingCandidatesRef.current = []
        }
        setRemoteSdp((data.sdp && data.sdp.sdp) ? (data.sdp.sdp.substring(0, 400) + '...') : '')
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (sock && typeof sock.emit === 'function') {
          sock.emit('signal-answer', { to: data.from, sdp: pc.localDescription })
          pushLog('sent answer to', data.from)
          setLocalSdp(pc.localDescription && pc.localDescription.sdp ? pc.localDescription.sdp.substring(0,400) + '...' : '')
        }
      } catch (err) { console.error('handle offer', err) }
    }

  const handleSignalAnswer = async (data) => {
      try {
    pushLog('received answer from', data.from)
        const pc = pcRef.current
        if (!pc) return
  await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
  // drain queued ICE candidates now that remote description is set
  if (pendingCandidatesRef.current.length) {
    for (const c of pendingCandidatesRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); setRemoteIceCount(n => n + 1) } catch (e) { console.warn('drain addIceCandidate failed', e) }
    }
    pendingCandidatesRef.current = []
  }
  setRemoteSdp((data.sdp && data.sdp.sdp) ? (data.sdp.sdp.substring(0,400) + '...') : '')
      } catch (err) { console.error('handle answer', err) }
    }

  const handleSignalIce = async (data) => {
      try {
    pushLog('received ice from', data.from)
        const pc = pcRef.current
        if (!data.candidate) return
        if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
          // remote description not set yet; queue the candidate
          pendingCandidatesRef.current.push(data.candidate)
          pushLog('queued remote candidate')
          return
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          setRemoteIceCount(c => c + 1)
        } catch (e) {
          console.warn('addIceCandidate failed, queuing candidate', e)
          pendingCandidatesRef.current.push(data.candidate)
        }
      } catch (err) { console.error('add ice', err) }
    }

  const handleCallAccepted = async (data) => {
      try {
    pushLog('call accepted by', data.from)
        if (data.from !== id) return
        const pc = pcRef.current
        if (!pc) return
        // if we already created an offer (initiator path) skip duplicate
        if (pc.localDescription && pc.localDescription.type === 'offer') {
          pushLog('call-accepted: offer already exists, skipping duplicate')
          return
        }
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (sock && typeof sock.emit === 'function') {
          sock.emit('signal-offer', { to: id, sdp: pc.localDescription })
          setLocalSdp(pc.localDescription && pc.localDescription.sdp ? pc.localDescription.sdp.substring(0,400) + '...' : '')
        }
      } catch (err) { console.error('failed to create/send offer after accept', err) }
    }

  // register handlers with guards to avoid TypeError if `on` is not a function
  try { if (typeof sock.on === 'function') sock.on('signal-offer', handleSignalOffer) } catch (e) { console.error('error registering signal-offer', e); pushLog('error registering signal-offer') }
  try { if (typeof sock.on === 'function') sock.on('signal-answer', handleSignalAnswer) } catch (e) { console.error('error registering signal-answer', e); pushLog('error registering signal-answer') }
  try { if (typeof sock.on === 'function') sock.on('signal-ice', handleSignalIce) } catch (e) { console.error('error registering signal-ice', e); pushLog('error registering signal-ice') }
  try { if (typeof sock.on === 'function') sock.on('call-accepted', handleCallAccepted) } catch (e) { console.error('error registering call-accepted', e); pushLog('error registering call-accepted') }

    // start flow: ensure local stream and pc are ready; if initiator (init=1) create and send offer immediately
    (async () => {
      if (!mounted) return
      try {
      const localS = await ensureLocalStream()
      pushLog('local stream ready', { tracks: localS.getTracks().length })
      await createPeerConnection(localS)
        if (init) {
          pushLog('caller: creating initial offer (init flag)')
          const pc = pcRef.current
          if (pc) {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            if (sock && typeof sock.emit === 'function') {
              sock.emit('signal-offer', { to: id, sdp: pc.localDescription })
              setLocalSdp(pc.localDescription && pc.localDescription.sdp ? pc.localDescription.sdp.substring(0,400) + '...' : '')
              pushLog('caller: sent initial offer to', id)
            }
          }
        }
        // if we had a pending accept (callee clicked Accept in Chat), notify caller now that we're ready
        if (pendingAccept && pendingAccept === id) {
          if (socketRef.current && typeof socketRef.current.emit === 'function') {
              socketRef.current.emit('call-accept', { to: id })
              pushLog('emitted call-accept to', id)
            } else { console.error('socket not ready to emit call-accept'); pushLog('socket not ready to emit call-accept') }
          try { localStorage.removeItem('pendingCallAccept') } catch (e) {}
          pendingAccept = null
        }
        // if init is true we wait for call-accepted (handler above will create offer)
      } catch (err) { console.error(err) }
    })()


    return () => {
      mounted = false
      try {
    if (sock && typeof sock.off === 'function') {
          sock.off('signal-offer', handleSignalOffer)
          sock.off('signal-answer', handleSignalAnswer)
          sock.off('signal-ice', handleSignalIce)
          sock.off('call-accepted', handleCallAccepted)
        }
      } catch (e) { console.warn('error removing socket handlers', e) }
      cleanup()
      // leave global socket connected; unbind local ref
      try { if (socketRef.current === s) socketRef.current = null } catch (e) {}
    }
  }, [socket, id])

  async function ensureLocalStream() {
    if (localStream) return localStream
    try {
      const constraints = mode === 'audio' ? { audio: true } : { audio: true, video: true }
      const s = await navigator.mediaDevices.getUserMedia(constraints)
      setLocalStream(s)
      if (localRef.current) localRef.current.srcObject = s
      return s
    } catch (err) { console.error('getUserMedia failed', err); throw err }
  }

  async function createPeerConnection(streamParam) {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    // add local tracks
    const s = streamParam || localStream
    if (s) {
      for (const t of s.getTracks()) pc.addTrack(t, s)
    }

    pc.ontrack = (ev) => {
      // attach remote stream
      if (remoteRef.current) remoteRef.current.srcObject = ev.streams[0]
      setConnected(true)
      pushLog('ontrack - remote stream attached')
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate && socketRef.current && otherRef.current) {
        socketRef.current.emit('signal-ice', { to: otherRef.current, candidate: ev.candidate })
        pushLog('local ice candidate', { to: otherRef.current })
        setLocalIceCount(c => c + 1)
      }
    }

    pc.onconnectionstatechange = () => {
      pushLog('pc state change', pc.connectionState)
      if (pc.connectionState === 'connected') {
        // start duration timer if not already
        if (!durationRef.current) {
          durationRef.current = setInterval(() => {
            setDuration(d => d + 1)
          }, 1000)
        }
      } else if (['disconnected','failed','closed'].includes(pc.connectionState)) {
        setConnected(false)
        // allow a short grace then redirect home
        setTimeout(() => {
          if (pcRef.current && pcRef.current.connectionState !== 'connected') {
            safeEndAndHome('connection ended: ' + pcRef.current.connectionState)
          }
        }, 1500)
      }
      setPcState(pc.connectionState)
    }

    pc.onicegatheringstatechange = () => {
      try { setIceState(pc.iceGatheringState); pushLog('iceGatheringState', pc.iceGatheringState) } catch(e){}
    }

    return pc
  }

  function safeEndAndHome(reason) {
    pushLog('ending call', reason)
    cleanup()
    // redirect to home page externally to ensure full reset
    try { window.location.href = '/' } catch (e) { navigate('/') }
  }

  function hangup() { safeEndAndHome('hangup clicked') }

  function cleanup() {
    try {
      if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null }
      if (pcRef.current) {
        try { pcRef.current.close() } catch (e) {}
        pcRef.current = null
      }
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop())
        setLocalStream(null)
      }
      if (remoteRef.current) remoteRef.current.srcObject = null
    } catch (e) { console.error(e) }
  }

  // Fetch remote user name for display
  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const res = await axios.get('/api/users')
        if (!aborted) {
          const users = res.data.users || res.data || []
            const found = users.find(u => String(u._id || u.id || u.userId) === String(id))
          if (found) setRemoteUserName(found.name || 'User')
          else setRemoteUserName(id)
        }
      } catch (e) { if (!aborted) setRemoteUserName(id) }
    })()
    return () => { aborted = true }
  }, [id])

  function formatDuration(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2,'0')
    const s = (sec % 60).toString().padStart(2,'0')
    return `${m}:${s}`
  }

  const toggleMute = () => {
    if (!localStream) return
    try {
      const audioTracks = localStream.getAudioTracks()
      if (!audioTracks.length) {
        pushLog('mute: no audio tracks found')
        return
      }
      const wantMute = !muted
      // Prefer disabling RTCRtpSender track to ensure negotiation unaffected
      if (pcRef.current) {
        try {
          const senders = pcRef.current.getSenders ? pcRef.current.getSenders() : []
          const audioSenders = senders.filter(s => s.track && s.track.kind === 'audio')
          audioSenders.forEach(s => { if (s.track) s.track.enabled = !wantMute })
          if (!audioSenders.length) pushLog('mute: no audio senders, falling back to local tracks')
        } catch (e) { pushLog('mute: sender toggle failed, fallback'); }
      }
      // Always update local stream tracks as UI source of truth
      audioTracks.forEach(t => { t.enabled = !wantMute })
      setMuted(wantMute)
      pushLog('mute toggled', { muted: wantMute, tracks: audioTracks.length })
    } catch (e) { console.error('toggleMute error', e); pushLog('mute error'); }
  }

  const toggleVideo = () => {
    if (!localStream) return
    localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled)
    setVideoDisabled(!videoDisabled)
  }

  const isConnected = connected && pcState === 'connected'

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-sky-600 to-emerald-600 animate-[gradientShift_12s_ease_infinite] bg-[length:300%_300%]" />
      <style>{`@keyframes gradientShift {0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
      <div className="relative z-10 flex flex-col items-center pt-24 px-4 pb-10">
        <div className="w-full max-w-5xl bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xl p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">{isConnected ? 'In call with' : 'Calling'} <span className="text-emerald-300">{remoteUserName}</span></h2>
              <div className="text-xs text-white/70 mt-1">Mode: {mode} · {isConnected ? 'Live' : pcState} · {formatDuration(duration)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={hangup} className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow">End Call</button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="relative group rounded-xl overflow-hidden bg-black/60 aspect-video flex items-center justify-center">
              <video ref={remoteRef} autoPlay playsInline className={`w-full h-full object-contain transition-opacity ${isConnected ? 'opacity-100' : 'opacity-40'}`} />
              {!isConnected && <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">Waiting for remote video…</div>}
              <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">{remoteUserName}</div>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-black/50 aspect-video flex items-center justify-center">
              <video ref={localRef} autoPlay playsInline muted className={`w-full h-full object-cover ${videoDisabled ? 'opacity-50' : ''}`} />
              <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">You</div>
              {muted && <div className="absolute top-2 right-2 bg-red-600/80 text-white text-[10px] px-2 py-1 rounded-full animate-pulse">MIC OFF</div>}
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button onClick={toggleMute} className={`px-3 py-1 rounded-full text-xs font-medium ${muted ? 'bg-red-600 text-white' : 'bg-white/80 text-gray-800'}`}>{muted ? 'Unmute' : 'Mute'}</button>
                {mode === 'video' && (
                  <button onClick={toggleVideo} className={`px-3 py-1 rounded-full text-xs font-medium ${videoDisabled ? 'bg-yellow-500 text-white' : 'bg-white/80 text-gray-800'}`}>{videoDisabled ? 'Video On' : 'Video Off'}</button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button onClick={ensureLocalStream} className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow">Start Local</button>
            <button onClick={toggleMute} className="px-5 py-2 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium shadow">{muted ? 'Unmute Mic' : 'Mute Mic'}</button>
            {mode === 'video' && <button onClick={toggleVideo} className="px-5 py-2 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium shadow">{videoDisabled ? 'Enable Video' : 'Disable Video'}</button>}
            <button onClick={hangup} className="px-5 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow">Hang Up</button>
          </div>
          <div className="mt-6 bg-white/5 rounded-xl p-4">
            <div className="text-xs text-white/70 mb-2">Debug • pc: {pcState} • ice: {iceState} • local ICE: {localIceCount} • remote ICE: {remoteIceCount}</div>
            <div className="grid md:grid-cols-2 gap-4 text-[11px] text-white/80 font-mono">
              <div>
                <div className="font-semibold mb-1">Local SDP</div>
                <div className="max-h-24 overflow-auto whitespace-pre-wrap bg-black/30 rounded p-2">{localSdp || '(none)'}</div>
              </div>
              <div>
                <div className="font-semibold mb-1">Remote SDP</div>
                <div className="max-h-24 overflow-auto whitespace-pre-wrap bg-black/30 rounded p-2">{remoteSdp || '(none)'}</div>
              </div>
              <div className="md:col-span-2">
                <div className="font-semibold mb-1">Event Log</div>
                <div className="h-32 overflow-auto bg-black/30 rounded p-2 space-y-0.5">
                  {logs.length === 0 && <div className="text-white/40">no logs yet</div>}
                  {logs.map((l,i) => <div key={i}>{l}</div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
