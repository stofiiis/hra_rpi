// public/client.js
const socket = io();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let me = { id: null };
let track = null;
let state = 'lobby';
let countdownEndAt = 0;
let players = {};
let cam = { x:0, y:0, zoom: 1 };

// UI
const nameInput = document.getElementById('name');
const btnName = document.getElementById('btnName');
const btnStart = document.getElementById('btnStart');
const btnReset = document.getElementById('btnReset');
const info = document.getElementById('info');
const raceInfo = document.getElementById('raceInfo');
const leaderboard = document.getElementById('leaderboard');

btnName.onclick = () => {
  const n = nameInput.value.trim();
  if(n) socket.emit('name', n);
};
btnStart.onclick = () => socket.emit('start');
btnReset.onclick = () => socket.emit('reset');

// Inputs
const input = { t:0, s:0, b:0 };
let keys = {};

window.addEventListener('keydown', (e)=>{
  keys[e.key]=true;
});
window.addEventListener('keyup', (e)=>{
  keys[e.key]=false;
});

// Touch joystick
const joyBase = document.getElementById('joyBase');
const joyKnob = document.getElementById('joyKnob');
const btnThrottle = document.getElementById('throttle');
const btnBrake = document.getElementById('brake');
let joy = { base:{x:86,y:window.innerHeight-86}, knob:{x:86,y:window.innerHeight-86}, active:false };

function touchPos(t){
  return { x: t.clientX, y: t.clientY };
}
function updateJoystick(e){
  const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if(!t) return;
  const p = touchPos(t);
  const dx = p.x - joy.base.x, dy = p.y - joy.base.y;
  const len = Math.hypot(dx,dy) || 1;
  const max = 48;
  joy.knob.x = joy.base.x + dx/len * Math.min(max, len);
  joy.knob.y = joy.base.y + dy/len * Math.min(max, len);
  input.s = Math.max(-1, Math.min(1, dx/60));
  input.t = Math.max(0, Math.min(1, (-dy+20)/80));
}
joyBase.addEventListener('touchstart', (e)=>{ joy.active=true; updateJoystick(e); }, {passive:false});
joyBase.addEventListener('touchmove', (e)=>{ updateJoystick(e); }, {passive:false});
joyBase.addEventListener('touchend', ()=>{ joy.active=false; joy.knob.x=joy.base.x; joy.knob.y=joy.base.y; input.s=0; input.t=0; }, {passive:false});

btnThrottle.addEventListener('touchstart', ()=> input.t=1, {passive:true});
btnThrottle.addEventListener('touchend', ()=> input.t=0, {passive:true});
btnBrake.addEventListener('touchstart', ()=> input.b=1, {passive:true});
btnBrake.addEventListener('touchend', ()=> input.b=0, {passive:true});

// Net
socket.on('hello', (data)=>{
  me.id = data.id;
  track = data.track;
  state = data.state;
  players = data.players;
  resize();
});

socket.on('join', (p)=>{ players[p.id]=p; });
socket.on('leave', (id)=>{ delete players[id]; });

socket.on('reset', ()=>{
  // rely on upcoming state broadcast
});

socket.on('state', (snap)=>{
  state = snap.state;
  countdownEndAt = snap.countdownEndAt;
  players = snap.players;
});

// Send input at 30Hz
setInterval(()=>{
  // desktop keys mapping
  const left = keys['ArrowLeft']||keys['a']||keys['A'];
  const right= keys['ArrowRight']||keys['d']||keys['D'];
  const up   = keys['ArrowUp']||keys['w']||keys['W'];
  const down = keys['ArrowDown']||keys['s']||keys['S'];
  input.s = (right?1:0) - (left?1:0);
  input.t = (up?1:0);
  input.b = (down?1:0) || (keys[' ']?1:0);

  socket.emit('input', input);
}, 1000/30);

// Resize
function resize(){
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(devicePixelRatio, devicePixelRatio);
}
window.addEventListener('resize', resize);

// --------- Rendering helpers (advanced-ish visuals) ----------
function drawTrack(g){
  if(!track) return;
  // background
  g.fillStyle = '#0b111e';
  g.fillRect(0,0,canvas.width, canvas.height);

  // offscreen world canvas to draw the track once (cache)
  if(!drawTrack.cache){
    const off = document.createElement('canvas');
    off.width = track.width;
    off.height = track.height;
    const og = off.getContext('2d');

    // grass
    og.fillStyle = '#0e3b1f';
    og.fillRect(0,0,off.width,off.height);
    // subtle noise
    for(let i=0;i<5000;i++){
      const x=Math.random()*off.width, y=Math.random()*off.height;
      og.fillStyle = 'rgba(255,255,255,0.02)';
      og.fillRect(x,y,1,1);
    }

    // road centerline path
    og.lineJoin='round'; og.lineCap='round';
    og.beginPath();
    const wps = track.waypoints;
    og.moveTo(wps[0].x, wps[0].y);
    for(let i=1;i<wps.length;i++){ og.lineTo(wps[i].x, wps[i].y); }
    og.closePath();

    // road stroke (thick)
    og.strokeStyle = '#4b4f56';
    og.lineWidth = track.roadHalf*2;
    og.stroke();

    // curbs (dashed white)
    og.setLineDash([16,8]);
    og.strokeStyle = '#dfe6f8';
    og.lineWidth = 4;
    og.stroke();
    og.setLineDash([]);

    // center dashed line
    og.strokeStyle = 'rgba(255,255,255,0.4)';
    og.lineWidth = 2;
    og.setLineDash([18,12]);
    og.stroke();
    og.setLineDash([]);

    // start/finish
    const s = wps[0];
    og.save();
    og.translate(s.x, s.y);
    og.rotate(0);
    og.fillStyle='#ffffff';
    for(let i=0;i<8;i++){
      og.fillRect(-10 + i*8, -track.roadHalf, 6, 18);
    }
    og.restore();

    drawTrack.cache = off;
  }

  // world to screen transform (fit entire track with padding)
  const pad = 40;
  const scale = Math.min(canvas.width/(track.width+pad*2), canvas.height/(track.height+pad*2))/devicePixelRatio;
  cam.zoom = scale;
  cam.x = track.width/2; cam.y = track.height/2;

  g.save();
  g.translate(canvas.width/(2*devicePixelRatio), canvas.height/(2*devicePixelRatio));
  g.scale(scale, scale);
  g.translate(-cam.x, -cam.y);

  // shadows
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 20; g.shadowOffsetY=6; g.shadowOffsetX=0;
  g.drawImage(drawTrack.cache, 0,0);

  // reset shadows for cars
  g.shadowColor='transparent'; g.shadowBlur=0;

  // checkpoints markers
  g.fillStyle='rgba(255,255,255,0.12)';
  for (let i=0;i<track.waypoints.length;i++){
    const a = track.waypoints[i];
    g.beginPath(); g.arc(a.x, a.y, 8, 0, Math.PI*2); g.fill();
  }

  // players
  for (const id of Object.keys(players)){
    const p = players[id];
    drawCar(g, p);
  }

  g.restore();

  // UI overlay
  renderHUD();
}

function drawCar(g, p){
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.angle);
  // car body
  const w=26, h=14;
  // under-glow
  g.fillStyle='rgba(0,0,0,0.45)';
  g.fillRect(-w*0.6, -h*0.7, w*1.2, h*1.4);

  // chassis
  g.fillStyle=p.color;
  roundRect(g, -w/2, -h/2, w, h, 4, true, false);

  // windshield
  g.fillStyle='rgba(255,255,255,0.7)';
  roundRect(g, -w*0.3, -h*0.35, w*0.6, h*0.3, 3, true, false);

  // stripes
  g.fillStyle='rgba(255,255,255,0.35)';
  g.fillRect(-w*0.05, -h/2, w*0.1, h);

  // name
  g.rotate(-p.angle);
  g.fillStyle='#fff'; g.font='12px sans-serif'; g.textAlign='center';
  g.fillText(`${p.name} (L${p.lap})`, 0, -18);
  g.restore();
}

function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if (w<2*r) r=w/2; if(h<2*r) r=h/2;
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  if(fill) ctx.fill(); if(stroke) ctx.stroke();
}

function renderHUD(){
  const my = players[me.id];
  if (!my) return;
  info.textContent = `You: ${my.name}`;
  let status = `State: ${state}`;
  if (state==='countdown'){
    const sec = Math.max(0, Math.ceil((countdownEndAt - Date.now())/1000));
    status += ` (start in ${sec}s)`;
  }
  raceInfo.textContent = status;

  // leaderboard
  const arr = Object.values(players).sort((a,b)=> (b.lap - a.lap) || (b.cp - a.cp));
  let html = '';
  arr.forEach((p,i)=>{
    const best = p.bestLap ? (p.bestLap/1000).toFixed(2)+'s' : '-';
    const last = p.lastLapTime ? (p.lastLapTime/1000).toFixed(2)+'s' : '-';
    html += `<div>${i+1}. ${p.name} — Lap ${p.lap} (best ${best}, last ${last})</div>`;
  });
  leaderboard.innerHTML = html;
}

// Draw loop
function loop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawTrack(ctx);
  requestAnimationFrame(loop);
}
function init(){
  resize();
  loop();
}
init();
