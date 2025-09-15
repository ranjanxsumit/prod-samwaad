# Project Documentation: Real-Time Chat & Video Calling App

## One-liner
A secure, real-time chat and one-to-one video calling app built with React + Tailwind (frontend), NestJS + Socket.IO (backend), MongoDB (storage), WebRTC (media), and Cloudinary (media storage).

## High-level plan
- Deliver a concise developer-facing reference including feature descriptions, API contracts, DB schemas, realtime events, WebRTC signaling flow, env variables, validation rules (Zod), and deployment/run steps for Windows PowerShell.

## Checklist (requirements from prompt)
- [x] Authentication (login/signup, bcrypt, JWT, toggle UI) — documented
- [x] User presence tracking (Socket.IO + MongoDB timestamps, last seen) — documented
- [x] Live chat (Socket.IO, MongoDB messages, typing, delivery status, image upload <=5MB, Cloudinary) — documented
- [x] Video calling (WebRTC P2P + Socket.IO signaling) — documented
- [x] Profile picture management (Cloudinary + MongoDB metadata) — documented
- [x] .env examples included
- [x] Full tech stack overview included

Notes: This is documentation only. If you want I can also generate starter code (frontend & backend skeletons) and example tests in the same repo next.

## Contract (tiny)
- Inputs: REST requests (JSON, multipart for uploads), Socket.IO messages, WebRTC SDP/ICE candidates, Cloudinary uploads.
- Outputs: JSON responses, Socket.IO events, MongoDB documents, Cloudinary URLs.
- Error modes: 400 (validation), 401 (auth), 413 (payload too large / client-side validation recommended), 5xx (server errors).
- Success criteria: Authenticated real-time chat, presence, image sharing (<=5MB), and one-to-one video calls using WebRTC signaling.

## Architecture overview
- Frontend: React + Tailwind. Routes: /login, /signup, /chat, /call/:peerId, /profile.
- Backend: NestJS app exposing REST endpoints (auth, users, messages, uploads) and a Socket.IO server attached to NestJS for realtime events and WebRTC signaling.
- DB: MongoDB (Atlas) with Mongoose models for User, Message, Presence, Media.
- Realtime: Socket.IO handles presence, messaging events, typing, delivery receipts, and WebRTC signaling.
- Media: Cloudinary for images, profile photos; validate size and MIME before upload.

## Environment (.env) — example (DO NOT COMMIT .env)
Note: rotate secrets before production.

MONGODB_URI="Connection-string"
JWT_SECRET=what_samwaad_do
CLOUDINARY_URL="cloudinaryapi-connection-string"

Other useful variables:
PORT=3000
CLIENT_URL=http://localhost:3001
TOKEN_EXPIRY=7d
MAX_CHAT_IMAGE_MB=5

## API: REST endpoints (suggested)
Base: /api/v1

Auth
- POST /auth/signup
  - Body: { name, email, password }
  - Validations: email format, password >= 8 chars
  - Response: { user, token }

- POST /auth/login
  - Body: { email, password }
  - Response: { user, token }

Users
- GET /users/me
  - Auth: Bearer
  - Response: { user }

- PATCH /users/me/profile
  - Auth: Bearer
  - Body: multipart/form-data or JSON for fields
  - Purpose: update name, bio, profile picture (Cloudinary URL saved in DB)

Messages
- GET /messages/:conversationId?limit=&before=
  - Auth: Bearer
  - Response: paginated messages

- POST /messages
  - Auth: Bearer
  - Body: { to, text?, imageUrl?, metadata? }
  - Response: stored message

Uploads (server-side Cloudinary proxy if needed)
- POST /uploads/image
  - Auth: Bearer
  - Body: multipart/form-data (file)
  - Server validates MIME & size (<=5MB) then uploads to Cloudinary, returns { url, public_id, width, height, bytes }

## Data models (Mongoose-style sketches)

User
- _id: ObjectId
- name: string
- email: string (unique)
- passwordHash: string
- avatar: { url, public_id, width, height, bytes }
- status: 'online' | 'offline'
- lastSeen: Date
- createdAt, updatedAt

Message
- _id: ObjectId
- from: ObjectId (User)
- to: ObjectId (User) or conversationId
- text?: string
- image?: { url, public_id, metadata }
- delivered: boolean
- read: boolean
- createdAt: Date

Presence (optional separate collection)
- userId: ObjectId
- socketId: string
- online: boolean
- lastSeen: Date

Index recommendations
- User.email (unique)
- Message.to + createdAt
- Presence.userId

## Socket.IO events (server ↔ client)

Connection lifecycle
- connect
- disconnect

Auth attach
- client -> server: authenticate { token }
  - server verifies token, associates socket with userId

Presence
- server -> all: user-online { userId, name, avatar }
- server -> all: user-offline { userId, lastSeen }
- client -> server: heartbeat/ping (optional)

Chat events
- client -> server: send-message { to, text?, image? }
  - server persists message, emits to recipient socket(s): message-received { message }

- server -> client: message-delivered { messageId, to } (when recipient socket receives and ack)
- client -> server: message-read { messageId } (when opened)
- server -> client: message-read-confirm { messageId }

Typing indicators
- client -> server: typing { to }
- server -> recipient: typing { from }

Image upload flow (recommended)
- client validates file size & MIME
- client -> server: request-signed-upload (optional)
- client uploads directly to Cloudinary or sends to server -> server uploads -> server emits message with image URL

## WebRTC signaling flow (one-to-one)

Goal: establish P2P audio/video between two authenticated users using Socket.IO for signaling.

1. Caller creates RTCPeerConnection.
2. Caller gets local media (getUserMedia) and adds tracks to connection.
3. Caller creates offer (createOffer) -> setLocalDescription -> emit signaling event: signal-offer { to, sdp }
4. Server forwards to callee (verify auth): signal-offer { from, sdp }
5. Callee receives offer, creates RTCPeerConnection, adds local streams, setRemoteDescription(offer), createAnswer -> setLocalDescription -> emit signal-answer { to: caller, sdp }
6. Caller setRemoteDescription(answer).
7. Both sides exchange ICE candidates: signal-ice-candidate { to, candidate } -> forward to peer and addIceCandidate.
8. Once ICE + DTLS complete, track.ontrack will fire and video elements can render remote stream.

Signaling events
- signal-offer { from, to, sdp }
- signal-answer { from, to, sdp }
- signal-ice { from, to, candidate }
- call-decline { from, to, reason }
- call-end { from, to }

Edge cases
- NAT/firewall: fallback via TURN server recommended for P2P connectivity in restrictive networks.
- Callee offline: server should return immediate busy/offline error.
- Multiple tabs: associate multiple sockets with same user; deliver to all active sockets.

## Cloudinary integration (server-side)
- Use official Cloudinary SDK (cloudinary v2).
- Validate file size and MIME type before uploading. Check `file.size` and `file.mimetype` for image/*.
- Prefer unsigned direct uploads from client with an expiring signature to avoid large payloads through your server; or accept uploads server-side for greater control.

Example server upload (Node.js, high-level)
- Validate size <= 5 * 1024 * 1024
- Validate mimetype (image/jpeg, image/png, image/webp)
- Use upload_stream to stream directly from request to Cloudinary to avoid buffering.

Returned metadata to store in DB: { url, public_id, bytes, width, height, format }

Security notes
- Hash passwords with bcrypt (bcryptjs or bcrypt, saltRounds=12). Never store raw passwords.
- JWT signed with strong secret (rotate in prod), use short expiry for sensitive ops and refresh tokens if needed.
- Use HTTPS in production. Enforce CORS allowed origins (CLIENT_URL).
- Validate all inputs (Zod) to prevent injection & malformed payloads.
- Rate limit endpoints (auth, uploads) and Socket.IO login attempts.
- Cloudinary: restrict allowed transformations and unsigned upload presets properly.
- Do not serve user uploads from backend without proper Content-Security-Policy headers.

Validation (Zod) examples
- Signup schema
  z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) })

- Message schema
  z.object({ to: z.string().length(24), text: z.string().max(2000).optional(), image: z.object({ url: z.string().url() }).optional() })

## Frontend notes (React + Tailwind + Redux Toolkit)
- Redux slices: authSlice, usersSlice (presence), chatSlice, mediaSlice, callSlice.
- Use React Router for pages: Login, Signup, Chat (conversation list + messages), Call (video element + controls), Profile.
- WebSocket manager: single shared Socket.IO client that attaches JWT token via query or initial authenticate event.
- Media constraints: default to { audio: true, video: { width: 1280, height: 720 } } but provide quality toggle.
- File uploads: client-side validate file size and type before passing to server or Cloudinary.

## Local dev & quick-start (Windows PowerShell)
Assumes separate frontend and backend folders. Replace as needed.

1) Run MongoDB (Atlas URL in .env) and set .env files for services.
2) Backend (NestJS)
```powershell
cd d:\samwaad-app\backend
pnpm install
pnpm run start:dev
```
3) Frontend (React)
```powershell
cd d:\samwaad-app\frontend
pnpm install
pnpm run dev
```
Notes: Ensure `CLIENT_URL` and `CORS` match.

---

Created by Sumit Ranjan
