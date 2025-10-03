
// rpi-multiplayer-tag/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30; // ticks per second
const WORLD = { width: 1200, height: 700 };

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
// IMPORTANT: allow all origins on local network for quick LAN play
const io = new Server(server, {
  cors: { origin: '*' }
});

// ---- Game State ----
let players = {}; // id -> { x, y, vx, vy, color, name, score, isIt, lastInputSeq }
let itId = null;

function randomSpawn() {
  return {
    x: Math.random() * (WORLD.width - 40) + 20,
    y: Math.random() * (WORLD.height - 40) + 20
  };
}

function randomColor() {
  const h = Math.floor(Math.random() * 360);
  return `hsl(${h}, 80%, 60%)`;
}

io.on('connection', (socket) => {
  const spawn = randomSpawn();
  const color = randomColor();
  players[socket.id] = {
    x: spawn.x, y: spawn.y, vx: 0, vy: 0, color, name: `P${Object.keys(players).length+1}`,
    score: 0, isIt: false, lastInputSeq: 0
  };

  // select an "it" if none
  if (!itId) {
    itId = socket.id;
    players[itId].isIt = true;
  }

  socket.emit('init', {
    id: socket.id,
    world: WORLD,
    players
  });
  socket.broadcast.emit('playerJoined', { id: socket.id, p: players[socket.id] });

  socket.on('name', (name) => {
    if (typeof name === 'string' && name.length <= 20) {
      players[socket.id].name = name;
    }
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p) return;
    // data: { seq, up, down, left, right, boost }
    p.lastInputSeq = data.seq || p.lastInputSeq;
    const speed = data.boost ? 7 : 4;
    let vx = 0, vy = 0;
    if (data.left) vx -= 1;
    if (data.right) vx += 1;
    if (data.up) vy -= 1;
    if (data.down) vy += 1;
    const len = Math.hypot(vx, vy) || 1;
    p.vx = (vx/len) * speed;
    p.vy = (vy/len) * speed;
  });

  socket.on('disconnect', () => {
    const wasIt = players[socket.id]?.isIt;
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });

    if (wasIt) {
      // assign next "it"
      const ids = Object.keys(players);
      if (ids.length) {
        itId = ids[Math.floor(Math.random()*ids.length)];
        players[itId].isIt = true;
        io.emit('newIt', { id: itId });
      } else {
        itId = null;
      }
    }
  });
});

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function tick(dt) {
  // integrate motion
  for (const [id, p] of Object.entries(players)) {
    p.x = clamp(p.x + p.vx, 10, WORLD.width - 10);
    p.y = clamp(p.y + p.vy, 10, WORLD.height - 10);
  }

  // collisions: if "it" touches someone else, tag them; "it" gains +1 score
  if (itId && players[itId]) {
    const it = players[itId];
    for (const [id, p] of Object.entries(players)) {
      if (id === itId) continue;
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d < 28) { // tag radius
        // swap
        it.isIt = false;
        p.isIt = true;
        itId = id;
        players[itId].score += 1;
        io.emit('newIt', { id: itId });
        break;
      }
    }
  }

  // broadcast snapshot (lightweight)
  io.emit('state', players);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  tick(dt);
}, 1000 / TICK_RATE);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
  console.log(`Open from LAN: http://<raspberry_ip>:${PORT}`);
});
