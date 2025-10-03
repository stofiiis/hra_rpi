// public/client.js
const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let me = { id: null };
let world = { width: canvas.width, height: canvas.height };
let players = {};
let inputSeq = 0;

const keys = { up:false, down:false, left:false, right:false, boost:false };

// UI elements
const nameInput = document.getElementById('name');
const setNameBtn = document.getElementById('setName');
const meInfo = document.getElementById('meInfo');

setNameBtn.onclick = () => {
  const name = nameInput.value.trim();
  socket.emit('name', name);
};

// Touch joystick
const touch = document.getElementById('touch');
const stick = document.getElementById('stick');
const boostBtn = document.getElementById('boost');
let touchActive = false;
let base = {x: 70, y: window.innerHeight - 120};
let knob = {x: base.x, y: base.y};
let dir = {x:0,y:0};

function handleTouch(e) {
  const t = e.touches[0] || e.changedTouches[0];
  if (!t) return;
  const rect = canvas.getBoundingClientRect();
  const x = t.clientX;
  const y = t.clientY;
  const dx = x - base.x;
  const dy = y - base.y;
  const len = Math.hypot(dx, dy) || 1;
  const max = 40;
  knob.x = base.x + dx/len * Math.min(max, len);
  knob.y = base.y + dy/len * Math.min(max, len);
  dir.x = dx/len;
  dir.y = dy/len;
  keys.left = dx < -8;
  keys.right = dx > 8;
  keys.up = dy < -8;
  keys.down = dy > 8;
}

touch.addEventListener('touchstart', (e) => { touchActive = true; handleTouch(e); }, {passive:false});
touch.addEventListener('touchmove', (e) => { handleTouch(e); }, {passive:false});
touch.addEventListener('touchend', () => {
  touchActive = false;
  knob.x = base.x; knob.y = base.y; dir = {x:0,y:0};
  keys.up=keys.down=keys.left=keys.right=false;
});

boostBtn.addEventListener('touchstart', () => { keys.boost = true; });
boostBtn.addEventListener('touchend', () => { keys.boost = false; });

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  if (e.key === ' ') keys.boost = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  if (e.key === ' ') keys.boost = false;
});

// Networking
socket.on('init', (data) => {
  me.id = data.id;
  world = data.world;
  players = data.players;
  canvas.width = world.width;
  canvas.height = world.height;
  meInfo.textContent = `You: ${players[me.id].name}`;
});

socket.on('playerJoined', ({ id, p }) => {
  players[id] = p;
});

socket.on('playerLeft', ({ id }) => {
  delete players[id];
});

socket.on('newIt', ({ id }) => {
  // visual feedback could be added
});

socket.on('state', (serverPlayers) => {
  players = serverPlayers;
  if (players[me.id]) {
    meInfo.textContent = `You: ${players[me.id].name}  |  Score: ${players[me.id].score}  |  ${players[me.id].isIt ? 'You are IT!' : 'Avoid IT'}`;
  }
});

function sendInput() {
  inputSeq++;
  socket.emit('input', { 
    seq: inputSeq, 
    up: keys.up, down: keys.down, left: keys.left, right: keys.right, boost: keys.boost 
  });
}

setInterval(sendInput, 1000/30);

// Render
function draw() {
  // background grid
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0,0,canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  for (let x=0; x<canvas.width; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0; y<canvas.height; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }

  // players
  for (const [id, p] of Object.entries(players)) {
    // trail / glow
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI*2);
    ctx.fillStyle = p.isIt ? 'rgba(255,80,80,0.6)' : 'rgba(255,255,255,0.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI*2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = p.isIt ? 4 : 2;
    ctx.strokeStyle = p.isIt ? '#ff5050' : '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.name}${p.isIt ? ' (IT)' : ''}`, p.x, p.y - 24);
  }

  // touch UI
  if (true) {
    const tc = document.getElementById('touch');
    const st = document.getElementById('stick');
    st.style.left = (knob.x - 25) + 'px';
    st.style.top  = (knob.y - 25) + 'px';
  }

  requestAnimationFrame(draw);
}
draw();
