# LAN Tag (Raspberry Pi + Node.js + Socket.IO)

Simple local-network multiplayer **tag** game. Runs on Raspberry Pi (or any Node.js machine) and is playable from laptops and phones on the same Wi‑Fi/LAN.

## Features
- Zero accounts, just open a URL on the same network.
- Works on mobile (onscreen joystick + boost) and desktop (WASD/Arrows + Space).
- Server-authoritative tagging & scoring.
- Broadcasts on `0.0.0.0` so devices can connect from LAN.

## Quick start (Raspberry Pi)
1. Copy this folder to your Pi (e.g., `scp -r rpi-multiplayer-tag pi@RASPBERRY_IP:~/`).
2. SSH into the Pi and install dependencies:
   ```bash
   cd rpi-multiplayer-tag
   npm install
   npm start
   ```
3. On your phone/laptop on the **same network**, open:
   ```
   http://<RASPBERRY_IP>:3000
   ```
   Tip: find the Pi's IP with `hostname -I`.

### Notes
- If you already have something on port 3000, change the `PORT` env var:
  ```bash
  PORT=4000 npm start
  ```
- Make sure your router/Wi‑Fi isolates clients **off** (no AP client isolation) for LAN play.

## Controls
- **Desktop:** WASD / Arrow keys to move, Space to boost.
- **Mobile:** Drag the joystick, hold BOOST to sprint.

## Files
- `server.js` – Express + Socket.IO server; runs the game loop and handles tagging and scores.
- `public/index.html`, `public/client.js`, `public/style.css` – client UI & rendering.
- `package.json` – dependencies & scripts.

Enjoy!
