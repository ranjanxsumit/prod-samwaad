# Samwaad (Real‑Time Chat & Calls)

Samwaad is a full‑stack real‑time communication app featuring secure authentication, 1:1 messaging, presence, and WebRTC audio/video calling with a polished animated call UI.

<img width="1390" height="691" alt="image" src="https://github.com/user-attachments/assets/a20c4a85-b2d8-4a3b-9eb2-c395dbb29cc9" />


<img width="1494" height="895" alt="image" src="https://github.com/user-attachments/assets/0686a771-924a-4345-a24b-4b0c3d90436e" />

<img width="1386" height="867" alt="image" src="https://github.com/user-attachments/assets/6a3f4341-4681-4cf3-96d4-bea3f771135f" />

<img width="1453" height="266" alt="image" src="https://github.com/user-attachments/assets/91d0e65f-f2f6-4562-bcbc-d1f93f340bda" />

<img width="1443" height="761" alt="image" src="https://github.com/user-attachments/assets/fc5f12bc-aa98-4889-9635-6697dbb644ec" />


## Features

### Core Messaging
- JWT based auth (signup / login)
- Protected REST APIs for users & messages
- Real‑time 1:1 messaging (Socket.IO)
- Message delivery events & live update without refresh
- Presence tracking (online users)

### Calling (WebRTC + Socket.IO Signalling)
- Audio & video call modes (`?mode=audio|video`)
- Caller / callee flow with accept / decline
- ICE candidate queuing before remote description is set (robust slow network handling)
- Automatic reconnect rejection & graceful teardown
- Call duration timer
- Remote user name resolution (fetches `/api/users` and matches ID)
- Animated gradient call background & responsive layout
- Mute / Unmute microphone (RTCRtpSender & track fallback)
- Video enable/disable (local track toggle)
- Visual MIC OFF badge & UI state indicators
- Automatic redirect to home when call ends / fails

### UX / Reliability Enhancements
- Debug event log (SDP & ICE counters) for diagnostics
- Graceful cleanup of streams & peer connection on exit
- Defensive guards around socket & peer events to avoid runtime errors

## Tech Stack
- Frontend: React + Vite + Redux Toolkit + Tailwind CSS + Socket.IO Client + Axios
- Backend: Node.js + Express + Socket.IO + Mongoose (MongoDB) + JWT
- Realtime: Socket.IO (messaging + signalling)
- Media: WebRTC (getUserMedia, RTCPeerConnection)

## Project Structure
```
backend/            Express + Socket.IO server
frontend/           React client (Vite)
```

Key frontend paths:
- `frontend/src/pages/Chat.jsx` – messaging UI & call initiate / accept popup
- `frontend/src/pages/Call.jsx` – WebRTC call screen
- `frontend/src/contexts/SocketProvider.jsx` – socket lifecycle & global listeners

## Prerequisites
- Node.js LTS (>= 18 recommended)
- pnpm (preferred) or npm / yarn
- MongoDB instance (local or hosted: MongoDB Atlas)

## Environment Variables (Backend)
Create `backend/.env` (never commit it) with:
```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster/sample
JWT_SECRET=change_me
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
CLIENT_ORIGIN=http://localhost:5173
```
Adjust `CLIENT_ORIGIN` for production domain (CORS + socket origins).

## Install Dependencies
From the project root run:
```powershell
# Backend
cd backend; pnpm install; cd ..
# Frontend
cd frontend; pnpm install; cd ..
```

## Development Run (Concurrent)
Open two terminals:
```powershell
# Terminal 1 - Backend API & Socket.IO
cd backend; pnpm start

# Terminal 2 - Frontend (Vite dev server)
cd frontend; pnpm dev
```
Frontend dev server default: `http://localhost:5173`
Backend default: `http://localhost:5000`

## Build (Frontend)
```powershell
cd frontend; pnpm build
```
Output in `frontend/dist` (can be served via CDN / static host or reverse proxied behind backend).

## Call Flow Summary
1. Caller opens `/call/<userId>?init=1&mode=video`
2. Local media acquired → offer created → `signal-offer` sent
3. Callee (after clicking Accept) sends `call-accept` → creates answer path
4. ICE candidates exchanged (`signal-ice`), queued until remote description set
5. When `RTCPeerConnection` hits `connected`, timer starts
6. Hangup / disconnect triggers cleanup + redirect `/`

## Mute Logic Details
- Uses `RTCPeerConnection.getSenders()` to disable audio track at sender level
- Falls back to `localStream.getAudioTracks()` if no sender
- Maintains UI state with a MIC OFF badge and log entry

## Common Issues & Debugging
| Issue | Cause | Fix |
|-------|-------|-----|
| No remote video | Answer/offer race or blocked media | Check Event Log & ensure permissions granted |
| ICE count stays 0 | Network restrictions | Verify STUN reachable, try different network |
| Mute not working | Track not applied | Ensure local stream started (`Start Local`) or call connected |
| Redirect too soon | Underlying connection blip | Adjust grace timeout in `Call.jsx` (`setTimeout` after state change) |

## Production Deployment (Example: Render / Railway / VPS)
1. Provision MongoDB (Atlas) & note credentials
2. Set backend environment variables in hosting dashboard
3. Build frontend and either:
	- Serve static `dist` via CDN and configure `CLIENT_ORIGIN` accordingly
	- Or integrate a static serve middleware in backend (optional)
4. Configure CORS + Socket.IO origins (server & deployment platform)
5. Push to `main`; host builds and restarts automatically (Render) or trigger pipeline
6. Test call flow with two browser sessions (different accounts)

## Security Notes
- JWT stored in localStorage (consider HTTP-only cookie for stronger CSRF protection in future)
- Validate all socket events (server should verify authenticated user - ensure auth middleware wraps Socket.IO connection)
- Never commit `.env` or secrets (purged history in this revision)

### Secret Leak Remediation (Performed)
Earlier history contained a committed `.env.example` with real credentials (MongoDB user, Cloudinary URL, JWT secret). A new clean history was built and force pushed. Actions you still MUST perform externally:
1. Rotate MongoDB user password (or delete and recreate the compromised DB user) in Atlas.
2. Invalidate any connection strings embedded in deployment platforms (update environment variables to new URI).
3. Rotate Cloudinary API key/secret (Dashboard: Security → Regenerate) and update backend `.env`.
4. Change `JWT_SECRET` to a new long random string (32+ bytes). All existing tokens will become invalid (forces re-auth).
5. Redeploy backend with new env values.
6. Verify no lingering build artifacts or logs contain old secrets.

### Generating Strong Secrets
Use PowerShell or Node:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Recommended Hardening
- Use dedicated least-privilege MongoDB user per environment.
- Enable IP allowlist / VPC peering for MongoDB Atlas.
- Add rate limiting & audit logging for auth endpoints.
- Consider moving secrets to a manager (Vault, Doppler, AWS Secrets Manager, Render native secrets).
- Add a pre-commit hook (e.g. `git-secrets`, `detect-secrets`) to block accidental commits.

## Roadmap / Possible Enhancements
- Group calls (multi-peer mesh or SFU integration)
- Screen sharing
- Push notifications for incoming calls
- Offline message queue / message status indicators
- E2E encryption layer (insertable streams / Double Ratchet)
- Better bandwidth & network quality stats overlay

## Scripts (Root Convenience)
Optionally add root scripts (not included yet) to run both servers via `concurrently`.

## License
Proprietary / All rights reserved (adjust if you plan OSS release).

---
Generated fresh after history purge: this README replaces prior internal documentation.





