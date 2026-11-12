/**
 * SyncEngine - Handles Multi-Channel Cross-Device Synchronization
 * 1. WebRTC Peer-to-Peer Live Sync via PeerJS (No server or account needed)
 * 2. Local Wi-Fi / REST Server Sync (XAMPP / PHP / Custom backend)
 * 3. Event-driven real-time updates across connected clients
 */
class SyncEngine {
  constructor(storage) {
    this.storage = storage;
    this.peer = null;
    this.peerId = null;
    this.activeConnections = new Map();
    this.listeners = new Set();
    this.syncStatus = 'disconnected'; // disconnected, connecting, connected, syncing
    this.apiUrl = '';
    this.autoSyncEnabled = true;

    // Live WebSocket Sync State
    this.wsClient = null;
    this.wsType = 'cloud'; // 'cloud' (secure wss:// broker) or 'local' (ws://localhost:3001)
    this.wsStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected'
    this.wsRoomCode = ''; // no shared default: the room code is the encryption secret
    this.wsLocalUrl = 'ws://localhost:3001';
    this.clientId = 'client-' + Math.random().toString(36).substring(2, 9);
    this.wsReconnectTimer = null;

    this.init();
    this._setupLifecycleListeners();
  }

  async init() {
    this.apiUrl = await this.storage.getSetting('apiUrl', ''); // server sync is opt-in
    this.savedSyncCode = await this.storage.getSetting('syncCode', null);
    this.wsRoomCode = (await this.storage.getSetting('wsRoomCode', '')).toUpperCase().trim();
    this.wsType = await this.storage.getSetting('wsType', 'cloud');
    this.wsLocalUrl = await this.storage.getSetting('wsLocalUrl', 'ws://' + (typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost') + ':3001');
  }

  // --- Event Listener Registration ---

  onSyncEvent(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(event, data) {
    this.listeners.forEach(cb => {
      try { cb(event, data); } catch (e) { console.error('Sync listener error:', e); }
    });
  }

  // --- PeerJS WebRTC Cross-Device Sync ---

  async startP2P(customCode = null) {
    if (typeof Peer === 'undefined') {
      console.warn('PeerJS not loaded yet');
      return null;
    }

    if (this.peer && !this.peer.destroyed) {
      return this.peerId;
    }

    return new Promise((resolve) => {
      // Use short, human-friendly id prefix
      const saved = this.savedSyncCode && this.savedSyncCode.length >= 16 ? this.savedSyncCode : null;
      const code = customCode || saved || SyncEngine.randomCode('st-');
      this.peer = new Peer(code, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        this.peerId = id;
        this.syncStatus = 'ready';
        this.storage.setSetting('syncCode', id);
        this._notify('p2p_ready', { peerId: id });
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        // Pairing sends every task, so never accept silently
        if (!confirm(`Device ${conn.peer} wants to pair and sync all tasks. Allow?`)) {
          conn.on('open', () => conn.close());
          return;
        }
        this._setupP2PConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS error:', err.type, err.message);
        if (err.type === 'unavailable-id') {
          // Retry with a random id if collision
          this.peer.destroy();
          const fallback = SyncEngine.randomCode('st-');
          this.startP2P(fallback).then(resolve);
        } else {
          this._notify('error', { message: err.message });
          resolve(null);
        }
      });
    });
  }

  async connectToDevice(remoteCode) {
    const cleanCode = remoteCode.trim().toLowerCase();
    if (!this.peer || this.peer.destroyed) {
      await this.startP2P();
    }

    if (cleanCode === this.peerId) {
      throw new Error('Cannot connect to your own device code');
    }

    const conn = this.peer.connect(cleanCode, { reliable: true });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out. Check the code and make sure the other device is open.'));
      }, 12000);

      this._setupP2PConnection(conn, () => {
        clearTimeout(timeout);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  _setupP2PConnection(conn, onOpenCallback) {
    conn.on('open', async () => {
      this.activeConnections.set(conn.peer, conn);
      this.syncStatus = 'connected';
      this._notify('device_connected', { peer: conn.peer, total: this.activeConnections.size });
      if (onOpenCallback) onOpenCallback();

      // Immediately initiate bi-directional synchronization
      const allTasks = await this.storage.getAllTasks(true);
      const categories = await this.storage.getCategories();
      conn.send({
        type: 'INITIAL_SYNC_REQUEST',
        tasks: allTasks,
        categories: categories,
        timestamp: Date.now()
      });
    });

    conn.on('data', async (payload) => {
      await this._handleP2PData(conn, payload);
    });

    conn.on('close', () => {
      this.activeConnections.delete(conn.peer);
      if (this.activeConnections.size === 0) {
        this.syncStatus = 'ready';
      }
      this._notify('device_disconnected', { peer: conn.peer, total: this.activeConnections.size });
    });
  }

  async _handleP2PData(conn, payload) {
    if (!payload || !payload.type) return;

    switch (payload.type) {
      case 'INITIAL_SYNC_REQUEST': {
        // Merge received tasks
        if (payload.tasks && Array.isArray(payload.tasks)) {
          const mergeResult = await this.storage.mergeTasks(payload.tasks);
          if (mergeResult.updated > 0) {
            this._notify('tasks_synced', { count: mergeResult.updated, source: 'p2p' });
          }
        }
        if (payload.categories) {
          await this.storage.saveCategories(payload.categories);
        }

        // Send back our tasks for complete symmetric merge
        const myTasks = await this.storage.getAllTasks(true);
        conn.send({
          type: 'INITIAL_SYNC_RESPONSE',
          tasks: myTasks,
          timestamp: Date.now()
        });
        break;
      }

      case 'INITIAL_SYNC_RESPONSE': {
        if (payload.tasks && Array.isArray(payload.tasks)) {
          const mergeResult = await this.storage.mergeTasks(payload.tasks);
          if (mergeResult.updated > 0) {
            this._notify('tasks_synced', { count: mergeResult.updated, source: 'p2p' });
          }
        }
        break;
      }

      case 'LIVE_TASK_UPDATE': {
        if (payload.task) {
          const res = await this.storage.mergeTasks([payload.task]);
          if (res.updated > 0) {
            this._notify('tasks_synced', { count: 1, source: 'p2p_live' });
          }
        }
        break;
      }
    }
  }

  broadcastLiveChange(task) {
    if (this.activeConnections.size > 0) {
      const msg = { type: 'LIVE_TASK_UPDATE', task, timestamp: Date.now() };
      for (const conn of this.activeConnections.values()) {
        if (conn.open) {
          try { conn.send(msg); } catch (e) { console.warn('Failed to broadcast to peer:', e); }
        }
      }
    }

    this.queueCloudSync();
  }

  // Auto-sync to GitHub Cloud (24/7) with debounce if enabled
  queueCloudSync() {
    if (this.cloudSyncDebounceTimer) clearTimeout(this.cloudSyncDebounceTimer);
    this.cloudSyncDebounceTimer = setTimeout(async () => {
      const enabled = await this.storage.getSetting('cloudSyncEnabled', false);
      if (enabled) {
        this.syncWithGitHub().catch(() => {});
      }
    }, 2500);
  }

  // --- Local / REST Server Sync ---

  async syncWithServer(url = null) {
    const targetUrl = url || this.apiUrl;
    if (!targetUrl) return { success: false, error: 'No API URL specified' };

    try {
      this._notify('sync_start', { target: targetUrl });
      const localTasks = await this.storage.getAllTasks(true);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          action: 'sync',
          tasks: localTasks,
          clientTime: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data && data.tasks && Array.isArray(data.tasks)) {
        const mergeResult = await this.storage.mergeTasks(data.tasks);
        this._notify('tasks_synced', { count: mergeResult.updated, source: 'server' });
        return { success: true, updated: mergeResult.updated, total: data.tasks.length };
      }
      return { success: true, updated: 0 };
    } catch (err) {
      console.warn('Server sync error:', err.message);
      this._notify('sync_error', { message: err.message });
      return { success: false, error: err.message };
    }
  }

  // --- 24/7 Cloud Sync via GitHub Gist (No computer/server needed!) ---

  async syncWithGitHub(token = null, gistId = null) {
    const ghToken = (token || await this.storage.getSetting('githubToken', '')).trim();
    let ghGistId = (gistId !== null ? gistId : await this.storage.getSetting('githubGistId', '')).trim();

    if (!ghToken) {
      return { success: false, error: 'No GitHub Personal Access Token provided' };
    }
    if (this._ghBusy) return { success: false, error: 'Sync already running' };
    this._ghBusy = true;
    const explicit = token !== null; // only the SYNC NOW button may create a gist
    let pulled = 0;
    let remoteTasks = null;
    let remoteSummaries = {};

    try {
      this._notify('sync_start', { target: 'github' });
      const localTasks = await this.storage.getAllTasks(true);
      const categories = await this.storage.getCategories();

      // If we have an existing Gist ID, fetch and merge
      if (ghGistId) {
        const getRes = await fetch(`https://api.github.com/gists/${ghGistId}`, {
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github+json'
          }
        });

        if (getRes.ok) {
          const gistData = await getRes.json();
          const file = gistData.files && gistData.files['synctask-data.json'];
          if (file && file.content) {
            try {
              const remoteParsed = JSON.parse(file.content);
              if (remoteParsed.tasks && Array.isArray(remoteParsed.tasks)) {
                remoteTasks = remoteParsed.tasks;
                pulled = (await this.storage.mergeTasks(remoteTasks)).updated;
              }
              remoteSummaries = remoteParsed.summaries || {};
              if (await this.storage.mergeSummaries(remoteSummaries)) this._notify('summaries_synced', {});
              if (remoteParsed.categories && Array.isArray(remoteParsed.categories)) {
                await this.storage.saveCategories(remoteParsed.categories);
              }
            } catch (e) {
              console.warn('Failed to parse remote gist content:', e);
            }
          }
        } else if (getRes.status === 404) {
          ghGistId = '';
        } else {
          const errData = await getRes.json().catch(() => ({}));
          throw new Error(errData.message || `GitHub error: HTTP ${getRes.status}`);
        }
      }

      // Now prepare current merged data to push to GitHub Gist
      const allCurrentTasks = await this.storage.getAllTasks(true);
      const summaries = await this.storage.getSummaries();
      const payloadString = JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        tasks: allCurrentTasks,
        categories: categories,
        summaries: summaries
      }, null, 2);

      const byId = list => JSON.stringify([...list].sort((a, b) => (a.id < b.id ? -1 : 1)));
      // tolerant of a damaged entry: it then just counts as different and the clean local copy is pushed
      const byDay = obj => JSON.stringify(Object.keys(obj || {}).sort().map(day => { const e = obj[day] || {}; return [day, e.text, e.updatedAt, !!e.pasted]; }));
      const unchanged = remoteTasks && byId(remoteTasks) === byId(allCurrentTasks) && byDay(remoteSummaries) === byDay(summaries);

      if (!ghGistId) {
        if (!explicit) throw new Error('Cloud sync is not set up on this device. Open Sync, 24/7 Cloud Gist.');
        // Create new private Gist
        const createRes = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            description: 'SyncTask 24/7 Cloud Sync Storage (Private)',
            public: false,
            files: {
              'synctask-data.json': {
                content: payloadString
              }
            }
          })
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.message || `GitHub create failed: HTTP ${createRes.status}`);
        }

        const newGist = await createRes.json();
        ghGistId = newGist.id;
        await this.storage.setSetting('githubGistId', ghGistId);
      } else if (!unchanged) {
        // Update existing Gist
        const updateRes = await fetch(`https://api.github.com/gists/${ghGistId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${ghToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            files: {
              'synctask-data.json': {
                content: payloadString
              }
            }
          })
        });

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(errData.message || `GitHub update failed: HTTP ${updateRes.status}`);
        }
      }

      await this.storage.setSetting('githubToken', ghToken);
      await this.storage.setSetting('githubGistId', ghGistId);
      await this.storage.setSetting('cloudSyncEnabled', true);
      if (pulled > 0) this._notify('tasks_synced', { count: pulled, source: 'github_gist' });
      return { success: true, gistId: ghGistId, total: allCurrentTasks.length };
    } catch (err) {
      console.warn('GitHub sync error:', err.message);
      this._notify('sync_error', { message: err.message });
      return { success: false, error: err.message };
    } finally {
      this._ghBusy = false;
    }
  }

  // --- Live WebSocket Real-Time Sync (Cloud & Local) ---

  async connectWebSocket(roomCode = null, type = null, localUrl = null) {
    if (roomCode) {
      this.wsRoomCode = roomCode.toUpperCase().trim();
      await this.storage.setSetting('wsRoomCode', this.wsRoomCode);
    } else {
      this.wsRoomCode = (await this.storage.getSetting('wsRoomCode', '')).toUpperCase().trim();
    }

    if (type) {
      this.wsType = type;
      await this.storage.setSetting('wsType', this.wsType);
    } else {
      this.wsType = await this.storage.getSetting('wsType', 'cloud');
    }

    if (localUrl) {
      this.wsLocalUrl = localUrl.trim();
      await this.storage.setSetting('wsLocalUrl', this.wsLocalUrl);
    } else {
      this.wsLocalUrl = await this.storage.getSetting('wsLocalUrl', 'ws://' + (typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost') + ':3001');
    }

    if (this.wsRoomCode && this.wsType === 'cloud') {
      if (!crypto.subtle) {
        this.disconnectWebSocket();
        throw new Error('Encrypted live sync needs https or localhost. Use Local Server mode on this address.');
      }
      // The code is the encryption key, so a short one (like the old public default) is not private
      if (this.wsRoomCode.length < 16) {
        this.wsRoomCode = '';
        await this.storage.setSetting('wsRoomCode', '');
        this.disconnectWebSocket();
        throw new Error('That room code is too short to be private. Press 🎲 to create one.');
      }
      await this._deriveRoomKeys();
    }
    this.disconnectWebSocket();
    if (!this.wsRoomCode) return; // live sync is opt-in

    this.wsStatus = 'connecting';
    this._notify('ws_status', { status: 'connecting', room: this.wsRoomCode, type: this.wsType });

    if (this.wsType === 'cloud') {
      this._connectCloudWebSocket();
    } else {
      this._connectLocalWebSocket();
    }
  }

  _connectCloudWebSocket() {
    if (typeof mqtt === 'undefined') {
      console.warn('MQTT library not yet loaded for Cloud WebSocket, retrying...');
      setTimeout(() => {
        if (this.wsStatus === 'connecting' && typeof mqtt !== 'undefined') {
          this._connectCloudWebSocket();
        }
      }, 1500);
      return;
    }

    const brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
    const topic = this.wsTopic;

    try {
      this.wsClient = mqtt.connect(brokerUrl, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 4000
      });

      this.wsClient.on('connect', () => {
        this.wsStatus = 'connected';
        this._notify('ws_status', { status: 'connected', room: this.wsRoomCode, type: 'cloud' });

        this.wsClient.subscribe(topic, (err) => {
          if (!err) {
            // Announce presence & ask existing peers in room for latest state
            this._publishCloud({ type: 'DEVICE_ANNOUNCE', clientId: this.clientId, timestamp: Date.now() });
          }
        });
      });

      this.wsClient.on('message', async (t, msg) => {
        try {
          // Anything not encrypted with our room key fails here and is dropped
          const { iv, data } = JSON.parse(msg.toString());
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: SyncEngine.fromB64(iv) }, this.wsKey, SyncEngine.fromB64(data));
          this._handleIncomingWebSocketMessage(JSON.parse(new TextDecoder().decode(plain)));
        } catch (e) {
          console.warn('Dropped unreadable Cloud WS message');
        }
      });

      this.wsClient.on('reconnect', () => {
        this.wsStatus = 'connecting';
        this._notify('ws_status', { status: 'connecting', room: this.wsRoomCode, type: 'cloud' });
      });

      this.wsClient.on('close', () => {
        if (this.wsStatus === 'connected') {
          this.wsStatus = 'connecting';
          this._notify('ws_status', { status: 'connecting', room: this.wsRoomCode, type: 'cloud' });
        }
      });

      this.wsClient.on('error', (err) => {
        console.warn('MQTT Cloud WS Error:', err.message);
      });
    } catch (e) {
      console.error('Failed to init Cloud WS:', e);
      this.wsStatus = 'disconnected';
      this._notify('ws_status', { status: 'disconnected', error: e.message });
    }
  }

  _connectLocalWebSocket() {
    try {
      const url = this.wsLocalUrl.startsWith('ws://') || this.wsLocalUrl.startsWith('wss://')
        ? this.wsLocalUrl
        : `ws://${this.wsLocalUrl}`;

      this.wsClient = new WebSocket(url);

      this.wsClient.onopen = () => {
        this.wsStatus = 'connected';
        this._notify('ws_status', { status: 'connected', room: this.wsRoomCode, type: 'local' });

        this.wsClient.send(JSON.stringify({
          type: 'JOIN_ROOM',
          room: this.wsRoomCode,
          clientId: this.clientId
        }));
      };

      this.wsClient.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this._handleIncomingWebSocketMessage(payload);
        } catch (e) {
          console.warn('Error parsing local WS message:', e);
        }
      };

      this.wsClient.onclose = () => {
        this.wsStatus = 'disconnected';
        this._notify('ws_status', { status: 'disconnected', room: this.wsRoomCode, type: 'local' });
        if (this.wsType === 'local') {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = setTimeout(() => {
            if (this.wsType === 'local' && this.wsStatus !== 'connected') {
              this._connectLocalWebSocket();
            }
          }, 3500);
        }
      };

      this.wsClient.onerror = (err) => {
        console.warn('Local WS error:', err);
      };
    } catch (e) {
      console.error('Failed to init Local WS:', e);
      this.wsStatus = 'disconnected';
      this._notify('ws_status', { status: 'disconnected', error: e.message });
    }
  }

  // --- End-to-end encryption for the public cloud broker ---
  // Key and topic both come from the room code, so the broker and other users see only ciphertext.
  // ponytail: single SHA-256, safe for generated codes (🎲); a short hand-typed code is guessable — switch to PBKDF2 if people pick their own.
  async _deriveRoomKeys() {
    const hash = async (label) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label + this.wsRoomCode)));
    this.wsKey = await crypto.subtle.importKey('raw', await hash('synctask-key:'), 'AES-GCM', false, ['encrypt', 'decrypt']);
    this.wsTopic = 'synctask/room/' + Array.from((await hash('synctask-topic:')).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  }

  async _publishCloud(payload) {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.wsKey, new TextEncoder().encode(JSON.stringify(payload)));
      this.wsClient.publish(this.wsTopic, JSON.stringify({ iv: SyncEngine.toB64(iv), data: SyncEngine.toB64(new Uint8Array(data)) }));
    } catch (e) {
      console.warn('WS cloud publish error:', e);
    }
  }

  static toB64(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  static fromB64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  static randomCode(prefix = '') {
    return prefix + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join('');
  }

  disconnectWebSocket() {
    clearTimeout(this.wsReconnectTimer);
    if (this.wsClient) {
      try {
        if (typeof this.wsClient.end === 'function') {
          this.wsClient.end(true);
        } else if (typeof this.wsClient.close === 'function') {
          this.wsClient.close();
        }
      } catch (e) {}
      this.wsClient = null;
    }
    this.wsStatus = 'disconnected';
    this._notify('ws_status', { status: 'disconnected', room: this.wsRoomCode });
  }

  broadcastLiveWebSocketChange(task, action = 'upsert') {
    const payload = action === 'delete'
      ? { type: 'TASK_DELETE', taskId: task.id || task, clientId: this.clientId, timestamp: Date.now(), room: this.wsRoomCode }
      : { type: 'TASK_UPSERT', task, clientId: this.clientId, timestamp: Date.now(), room: this.wsRoomCode };

    if (this.wsType === 'cloud' && this.wsClient && this.wsStatus === 'connected') {
      this._publishCloud(payload);
    } else if (this.wsType === 'local' && this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
      try {
        this.wsClient.send(JSON.stringify(payload));
      } catch (e) {
        console.warn('WS local send error:', e);
      }
    }

    // Also propagate to P2P and GitHub Gist sync
    this.broadcastLiveChange(task);
  }

  async _handleIncomingWebSocketMessage(payload) {
    if (!payload || !payload.type) return;
    if (payload.clientId === this.clientId || payload.senderId === this.clientId) {
      return; // Ignore echo
    }

    switch (payload.type) {
      case 'TASK_UPSERT': {
        if (payload.task) {
          const res = await this.storage.mergeTasks([payload.task]);
          if (res.updated > 0) {
            this._notify('ws_task_received', { task: payload.task, count: 1 });
            this._notify('tasks_synced', { count: 1, source: 'websocket' });
          }
        }
        break;
      }

      case 'TASK_DELETE': {
        if (payload.taskId) {
          await this.storage.deleteTask(payload.taskId);
          this._notify('ws_task_deleted', { taskId: payload.taskId });
          this._notify('tasks_synced', { count: 1, source: 'websocket' });
        }
        break;
      }

      case 'DEVICE_ANNOUNCE': {
        const currentTasks = await this.storage.getAllTasks(true);
        if (currentTasks.length > 0) {
          const responsePayload = {
            type: 'FULL_SYNC_RESPONSE',
            room: this.wsRoomCode,
            clientId: this.clientId,
            tasks: currentTasks,
            timestamp: Date.now()
          };
          if (this.wsType === 'cloud' && this.wsClient) {
            this._publishCloud(responsePayload);
          } else if (this.wsType === 'local' && this.wsClient && this.wsClient.readyState === WebSocket.OPEN) {
            this.wsClient.send(JSON.stringify(responsePayload));
          }
        }
        this._notify('ws_peer_joined', { peer: payload.clientId });
        break;
      }

      case 'FULL_SYNC_RESPONSE':
      case 'ROOM_JOINED':
      case 'FULL_STATE': {
        if (payload.tasks && Array.isArray(payload.tasks) && payload.tasks.length > 0) {
          const res = await this.storage.mergeTasks(payload.tasks);
          if (res.updated > 0) {
            this._notify('tasks_synced', { count: res.updated, source: 'websocket_bulk' });
          }
        }
        break;
      }
    }
  }

  _setupLifecycleListeners() {
    if (typeof window === 'undefined') return;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.storage.getSetting('cloudSyncEnabled', false).then(on => { if (on) this.syncWithGitHub().catch(() => {}); });
        if (this.wsStatus !== 'connected') {
          console.log('[WS] App resumed, reconnecting WebSocket...');
          this.connectWebSocket().catch(() => {});
        }
      }
    });

    window.addEventListener('online', () => {
      console.log('[WS] Network back online, reconnecting WebSocket...');
      this.connectWebSocket().catch(() => {});
    });
  }
}

// Global instance
window.syncEngine = new SyncEngine(window.storageEngine);

