# Samwaad Backend (scaffold)

Quick scaffold for the Samwaad backend. It includes:
- Express REST endpoints for auth, users, messages
- Socket.IO for presence, messaging and WebRTC signaling
- Mongoose models for User, Message, Presence
- Cloudinary upload helper (server-side streaming)

Environment
- Copy `.env.example` to `.env` and fill values (MONGODB_URI, JWT_SECRET, CLOUDINARY_URL)

Run (Windows PowerShell)
```
cd d:\samwaad-app\backend
pnpm install
pnpm run dev
```

Notes
- This is a scaffold to start from. It doesn't include production hardening, tests, or a TURN server for WebRTC.
