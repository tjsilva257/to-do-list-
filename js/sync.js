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

    this.init();
  }

  async init() {
    this.apiUrl = await this.storage.getSetting('apiUrl', window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '') + '/api/sync.php');
    this.savedSyncCode = await this.storage.getSetting('syncCode', null);
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
      const code = customCode || this.savedSyncCode || ('st-' + Math.random().toString(36).substring(2, 7));
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
        this._setupP2PConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS error:', err.type, err.message);
        if (err.type === 'unavailable-id') {
          // Retry with a random id if collision
          this.peer.destroy();
          const fallback = 'st-' + Math.random().toString(36).substring(2, 7);
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
    if (this.activeConnections.size === 0) return;
    const msg = { type: 'LIVE_TASK_UPDATE', task, timestamp: Date.now() };
    for (const conn of this.activeConnections.values()) {
      if (conn.open) {
        try { conn.send(msg); } catch (e) { console.warn('Failed to broadcast to peer:', e); }
      }
    }
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
}

// Global instance
window.syncEngine = new SyncEngine(window.storageEngine);

