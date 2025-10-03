// rpi-multiplayer-racing/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const TICK = 30; // Hz
const LAPS_TO_WIN = parseInt(process.env.LAPS || '3', 10);

const app = express();
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({ origin: true }));
app.use(express.static('public', { maxAge: '1d' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true }
});

// ---- Track definition (server-authoritative) ----
// Centerline waypoints (simple oval/lemniscate hybrid)
const TRACK = {
  width: 1400,
  height: 900,
  roadHalf: 90,          // half width of road (px)
  offroadFriction: 0.86, // slowdown factor off the road
  waypoints: [
    {x: 200, y: 450}, {x: 350, y: 260}, {x: 600, y: 180}, {x: 900, y: 210},
    {x: 1100,y: 350}, {x: 1220,y: 520}, {x: 1150,y: 720}, {x: 900, y: 800},
    {x: 600, y: 760}, {x: 380, y: 650}, {x: 260, y: 540}
  ]
};

// ---- Game state ----
const players = new Map(); // socketId -> player
let raceState = 'lobby';   // 'lobby' | 'countdown' | 'running' | 'finished'
let countdownEndAt = 0;

function len2(x,y){ return Math.hypot(x,y); }

function spawnOnStart(idx=0){
  const wp = TRACK.waypoints[0];
  // small grid offsets
  const dx = 0, dy = (idx%4)*24;
  return { x: wp.x + dx, y: wp.y + dy, angle: 0 };
}

function distToSegment(p,a,b){
  // distance from p to segment ab
  const abx=b.x-a.x, aby=b.y-a.y;
  const apx=p.x-a.x, apy=p.y-a.y;
  const ab2=abx*abx+aby*aby||1;
  let t=(apx*abx+apy*aby)/ab2; t=Math.max(0,Math.min(1,t));
  const cx=a.x+abx*t, cy=a.y+aby*t;
  return Math.hypot(p.x-cx,p.y-cy);
}

function nearestRoadDist(p){
  // find minimal distance to polyline centerline
  const w=TRACK.waypoints; let min=Infinity;
  for(let i=0;i<w.length;i++){
    const a=w[i], b=w[(i+1)%w.length];
    const d=distToSegment(p,a,b);
    if(d<min) min=d;
  }
  return min;
}

function nextCheckpointIndex(idx){
  return (idx+1)%TRACK.waypoints.length;
}

function resetRace(){
  raceState='lobby';
  for (const p of players.values()){
    const s = spawnOnStart(p.spawnIdx||0);
    p.x=s.x; p.y=s.y; p.v=0; p.angle=s.angle;
    p.lap=0; p.checkpoint=0; p.finished=false; p.bestLap=null; p.lastLapTime=null; p.lapStart=0;
  }
}

function startCountdown(){
  raceState='countdown';
  countdownEndAt = Date.now() + 3000;
}

function startRace(){
  raceState='running';
  const now=Date.now();
  for (const p of players.values()){ p.lap=0; p.checkpoint=0; p.lapStart=now; }
}

function finishRace(){
  raceState='finished';
}

io.on('connection', (socket)=>{
  const spawnIdx = players.size;
  const sp = spawnOnStart(spawnIdx);
  const colorHue = Math.floor(Math.random()*360);

  const player = {
    id: socket.id,
    name: `Driver ${players.size+1}`,
    color: `hsl(${colorHue},85%,55%)`,
    x: sp.x, y: sp.y, v: 0, angle: sp.angle,
    throttle: 0, steer: 0, brake: 0,
    lap: 0, checkpoint: 0, finished: false,
    lastSeen: Date.now(), spawnIdx,
    bestLap: null, lastLapTime: null, lapStart: 0,
    ping: 0
  };
  players.set(socket.id, player);

  socket.emit('hello', {
    id: socket.id, track: TRACK, state: raceState, players: Object.fromEntries([...players].map(([id,p])=>[id,p]))
  });
  socket.broadcast.emit('join', player);

  socket.on('name', (name)=>{
    if(typeof name==='string' && name.length<=20){
      player.name = name;
    }
  });

  socket.on('input', (inp)=>{
    // inp: {t, s, b} -> throttle [0..1], steer [-1..1], brake [0..1]
    player.throttle = Math.max(0, Math.min(1, inp.t||0));
    player.steer = Math.max(-1, Math.min(1, inp.s||0));
    player.brake = Math.max(0, Math.min(1, inp.b||0));
    player.lastSeen = Date.now();
  });

  socket.on('start', ()=>{
    if (raceState==='lobby' && players.size>=1){
      startCountdown();
    }
  });

  socket.on('reset', ()=>{
    resetRace();
    io.emit('reset', {});
  });

  socket.on('disconnect', ()=>{
    players.delete(socket.id);
    io.emit('leave', socket.id);
    if (players.size===0){ resetRace(); }
  });
});

// Physics params
const ACCEL = 0.18;
const BRAKE = 0.35;
const DRAG  = 0.015;
const TURN_RATE = 0.06; // radians per tick at full steer
const MAX_SPEED = 9.0;

function step(){
  const now=Date.now();

  if (raceState==='countdown' && now>=countdownEndAt){
    startRace();
  }

  if (raceState==='running'){
    for (const p of players.values()){
      // turning depends on speed
      const turn = p.steer * TURN_RATE * (0.4 + 0.6*Math.min(1, Math.abs(p.v)/MAX_SPEED));
      p.angle += turn;

      // accelerate/brake
      p.v += p.throttle*ACCEL;
      p.v -= p.brake*BRAKE;
      // drag
      p.v *= (1-DRAG);

      // clamp
      if (p.v>MAX_SPEED) p.v=MAX_SPEED;
      if (p.v<-MAX_SPEED*0.4) p.v=-MAX_SPEED*0.4;

      // move
      p.x += Math.cos(p.angle)*p.v;
      p.y += Math.sin(p.angle)*p.v;

      // offroad slowdown
      const d = nearestRoadDist({x:p.x,y:p.y});
      if (d>TRACK.roadHalf){
        p.v *= TRACK.offroadFriction;
      }

      // checkpoint/lap logic
      const nextIdx = p.checkpoint;
      const a = TRACK.waypoints[nextIdx];
      const dist = Math.hypot(p.x-a.x, p.y-a.y);
      if (dist < Math.max(40, p.v*2+20)){
        p.checkpoint = nextCheckpointIndex(p.checkpoint);
        if (p.checkpoint===0){
          // completed a lap
          const lapTime = now - (p.lapStart || now);
          p.lap += 1; p.lastLapTime = lapTime; p.lapStart = now;
          if (p.bestLap===null || lapTime<p.bestLap) p.bestLap=lapTime;
          if (p.lap >= LAPS_TO_WIN){
            p.finished = true;
            finishRace();
          }
        }
      }
    }
  }

  // broadcast snapshot
  const snapshot = {};
  for (const [id,p] of players){
    snapshot[id] = {
      id, name: p.name, color: p.color,
      x:p.x, y:p.y, v:p.v, angle:p.angle,
      lap:p.lap, cp:p.checkpoint, finished:p.finished,
      bestLap:p.bestLap, lastLapTime:p.lastLapTime
    };
  }

  io.emit('state', { t: now, state: raceState, countdownEndAt, players: snapshot });
}

setInterval(step, 1000/TICK);

server.listen(PORT, HOST, () => {
  console.log(`Racing server on http://${HOST}:${PORT}`);
  console.log(`Open from LAN or forwarded: http://<public_or_local_ip>:${PORT}`);
});
