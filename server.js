/**
 * SyncTask Live WebSocket & HTTP Server
 * Real-time bi-directional synchronization for PC, Phone, and Tablet.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'api', 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory Room State & Persistence
const rooms = new Map(); // roomCode -> Set<WebSocket>
const roomData = new Map(); // roomCode -> { tasks: Map<id, task>, lastUpdated: number }

// Load persisted default tasks if file exists
function loadInitialTasks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        const taskMap = new Map();
        list.forEach(t => { if (t && t.id) taskMap.set(t.id, t); });
        return taskMap;
      }
    }
  } catch (err) {
    console.warn('[Storage] Warning reading persisted todos:', err.message);
  }
  return new Map();
}

function saveTasksToFile(taskMap) {
  try {
    const list = Array.from(taskMap.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[Storage] Error saving todos:', err.message);
  }
}

function getRoomState(roomCode) {
  if (!roomData.has(roomCode)) {
    const initialMap = roomCode === 'default' || roomCode.startsWith('PHANTOM') ? loadInitialTasks() : new Map();
    roomData.set(roomCode, {
      tasks: initialMap,
      lastUpdated: Date.now()
    });
  }
  return roomData.get(roomCode);
}

// MIME types for static HTTP server
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
};

// Create HTTP Server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check / API status endpoint
  if (req.url === '/api/ws-status' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'SyncTask Live WebSocket Server',
      activeRooms: rooms.size,
      uptime: process.uptime()
    }));
    return;
  }

  // Static file serving
  let parsedUrl = req.url.split('?')[0];
  let filePath = path.join(__dirname, parsedUrl === '/' ? 'index.html' : parsedUrl);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + readErr.message);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

// Create WebSocket Server attaching to HTTP server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  let currentRoom = null;
  let clientId = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (!data || !data.type) return;

      switch (data.type) {
        case 'JOIN_ROOM': {
          const roomCode = (data.room || 'PHANTOM-DEFAULT').toUpperCase().trim();
          clientId = data.clientId || ('client-' + Math.random().toString(36).substring(2, 8));
          currentRoom = roomCode;

          if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
          }
          rooms.get(roomCode).add(ws);

          const state = getRoomState(roomCode);
          const taskList = Array.from(state.tasks.values());

          // Send current state to newly joined client
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            room: roomCode,
            clientId,
            tasks: taskList,
            clientCount: rooms.get(roomCode).size,
            serverTime: Date.now()
          }));

          // Notify other participants in room
          broadcastToRoom(roomCode, {
            type: 'PEER_JOINED',
            room: roomCode,
            clientId,
            clientCount: rooms.get(roomCode).size
          }, ws);

          console.log(`[WS] Client ${clientId} joined room: ${roomCode} (${rooms.get(roomCode).size} peers)`);
          break;
        }

        case 'TASK_UPSERT': {
          if (!currentRoom || !data.task || !data.task.id) return;
          const state = getRoomState(currentRoom);
          const task = data.task;
          const existing = state.tasks.get(task.id);

          // Last-Write-Wins check
          if (!existing || (task.updatedAt || 0) >= (existing.updatedAt || 0)) {
            state.tasks.set(task.id, task);
            state.lastUpdated = Date.now();
            saveTasksToFile(state.tasks);
          }

          // Broadcast live change to all peers in room
          broadcastToRoom(currentRoom, {
            type: 'TASK_UPSERT',
            room: currentRoom,
            task,
            senderId: data.clientId || clientId,
            timestamp: Date.now()
          }, ws);
          break;
        }

        case 'TASK_DELETE': {
          if (!currentRoom || !data.taskId) return;
          const state = getRoomState(currentRoom);
          if (state.tasks.has(data.taskId)) {
            const t = state.tasks.get(data.taskId);
            t.deletedAt = Date.now();
            t.updatedAt = Date.now();
            state.tasks.set(data.taskId, t);
            saveTasksToFile(state.tasks);
          }

          broadcastToRoom(currentRoom, {
            type: 'TASK_DELETE',
            room: currentRoom,
            taskId: data.taskId,
            senderId: data.clientId || clientId,
            timestamp: Date.now()
          }, ws);
          break;
        }

        case 'REQUEST_STATE': {
          if (!currentRoom) return;
          const state = getRoomState(currentRoom);
          ws.send(JSON.stringify({
            type: 'FULL_STATE',
            room: currentRoom,
            tasks: Array.from(state.tasks.values()),
            serverTime: Date.now()
          }));
          break;
        }

        case 'FULL_SYNC': {
          if (!currentRoom || !Array.isArray(data.tasks)) return;
          const state = getRoomState(currentRoom);
          let changed = false;

          data.tasks.forEach(t => {
            if (!t || !t.id) return;
            const existing = state.tasks.get(t.id);
            if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
              state.tasks.set(t.id, t);
              changed = true;
            }
          });

          if (changed) {
            saveTasksToFile(state.tasks);
          }

          // Send back merged state
          broadcastToRoom(currentRoom, {
            type: 'FULL_STATE',
            room: currentRoom,
            tasks: Array.from(state.tasks.values()),
            senderId: data.clientId || clientId,
            serverTime: Date.now()
          });
          break;
        }

        case 'PING': {
          ws.send(JSON.stringify({ type: 'PONG', time: Date.now() }));
          break;
        }
      }
    } catch (e) {
      console.warn('[WS] Error processing message:', e.message);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomSet = rooms.get(currentRoom);
      roomSet.delete(ws);
      if (roomSet.size === 0) {
        rooms.delete(currentRoom);
      } else {
        broadcastToRoom(currentRoom, {
          type: 'PEER_LEFT',
          room: currentRoom,
          clientId,
          clientCount: roomSet.size
        });
      }
      console.log(`[WS] Client ${clientId || 'unknown'} left room: ${currentRoom}`);
    }
  });

  ws.on('error', (err) => {
    console.warn('[WS] Connection error:', err.message);
  });
});

function broadcastToRoom(roomCode, payload, excludeWs = null) {
  const roomSet = rooms.get(roomCode);
  if (!roomSet) return;
  const msg = JSON.stringify(payload);
  for (const client of roomSet) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
      } catch (e) {
        console.warn('[WS] Broadcast failed for client:', e.message);
      }
    }
  }
}

// Keepalive Ping Interval (every 25 seconds)
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Helper to find local LAN IP
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n=============================================================');
  console.log('  🎭 PERSONA 5 SYNCTASK — LIVE WEBSOCKET & HTTP SERVER 🎭  ');
  console.log('=============================================================');
  console.log(`  ★ Local PC:       http://localhost:${PORT}`);
  console.log(`  ★ Phone / Wi-Fi:  http://${localIp}:${PORT}`);
  console.log(`  ★ WebSocket URL:  ws://${localIp}:${PORT}`);
  console.log('=============================================================');
  console.log('  Live real-time sync is ready. Open on your phone and laptop!\n');
});
