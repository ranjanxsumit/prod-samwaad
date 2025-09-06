import React, { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useSocket } from '../contexts/SocketProvider'

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
      socketRef.current.on('disconnect', () => { console.log('call socket disconnected') })
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

    // start flow: always ensure local stream and pc are ready; if initiator, wait for callee to accept
    (async () => {
      if (!mounted) return
      try {
      const localS = await ensureLocalStream()
      pushLog('local stream ready', { tracks: localS.getTracks().length })
      await createPeerConnection(localS)
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
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setConnected(false)
      }
      setPcState(pc.connectionState)
    }

    pc.onicegatheringstatechange = () => {
      try { setIceState(pc.iceGatheringState); pushLog('iceGatheringState', pc.iceGatheringState) } catch(e){}
    }

    return pc
  }

  function hangup() {
    cleanup()
    navigate('/chat')
  }

  function cleanup() {
    try {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ paddingTop: '6rem' }}>
      <div className="w-full max-w-4xl bg-white rounded shadow p-6">
        <h2 className="text-xl mb-4 text-center">Call with {id} ({mode})</h2>
        <div className="flex flex-col md:flex-row items-center md:items-stretch gap-4 justify-center">
          <video ref={localRef} autoPlay playsInline muted className="w-full md:w-1/2 bg-black h-60 rounded" />
          <video ref={remoteRef} autoPlay playsInline className="w-full md:w-1/2 bg-black h-60 rounded" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          <button onClick={ensureLocalStream} className="bg-green-600 text-white px-4 py-2 rounded">Start Local</button>
          <button onClick={() => { if (localStream) { localStream.getAudioTracks().forEach(t=>t.enabled = !t.enabled) } }} className="bg-yellow-600 text-white px-4 py-2 rounded">Toggle Audio</button>
          <button onClick={hangup} className="bg-red-600 text-white px-4 py-2 rounded">Hang up</button>
        </div>
        <div className="mt-3 text-sm text-gray-500 text-center">Status: {connected ? 'connected' : 'not connected'}</div>
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">Debug</div>
          <div className="text-xs mb-2">pc: {pcState} · ice: {iceState} · local ICE: {localIceCount} · remote ICE: {remoteIceCount}</div>
          <div className="text-xs mb-2">localSDP: {localSdp ? <span className="font-mono">{localSdp}</span> : <em className="text-gray-400">(none)</em>}</div>
          <div className="text-xs mb-2">remoteSDP: {remoteSdp ? <span className="font-mono">{remoteSdp}</span> : <em className="text-gray-400">(none)</em>}</div>
          <div className="h-40 overflow-auto bg-gray-50 p-2 rounded text-xs font-mono">
            {logs.length === 0 && <div className="text-gray-400">no logs yet</div>}
            {logs.map((l,i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
