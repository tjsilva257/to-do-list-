/**
 * StorageEngine - Offline-first persistence with IndexedDB & localStorage fallback
 * Supports tombstones (deletedAt) and timestamps (updatedAt) for seamless sync.
 */
class StorageEngine {
  constructor() {
    this.dbName = 'SyncTaskDB';
    this.dbVersion = 1;
    this.db = null;
    this.isReady = this.initDB();
  }

  async initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        resolve(false);
        return;
      }

      const request = window.indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (e) => {
        console.warn('IndexedDB error, falling back to localStorage:', e);
        resolve(false);
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(true);
      };

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          taskStore.createIndex('completed', 'completed', { unique: false });
          taskStore.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // --- Tasks Operations ---

  async getAllTasks(includeDeleted = false) {
    await this.isReady;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction('tasks', 'readonly');
        const store = tx.objectStore('tasks');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          resolve(includeDeleted ? list : list.filter(t => !t.deletedAt));
        };
        req.onerror = () => resolve(this._getLocalStorageTasks(includeDeleted));
      });
    }
    return this._getLocalStorageTasks(includeDeleted);
  }

  async saveTask(task) {
    await this.isReady;
    const now = Date.now();
    if (!task.id) {
      task.id = 'task_' + now + '_' + Math.random().toString(36).substring(2, 9);
      task.createdAt = now;
    }
    task.updatedAt = now;
    if (task.completed === undefined) task.completed = false;
    if (!task.subtasks) task.subtasks = [];
    if (!task.tags) task.tags = [];

    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.put(task);
        req.onsuccess = () => {
          this._syncToLocalStorage();
          resolve(task);
        };
        req.onerror = (e) => reject(e);
      });
    }
    return this._saveLocalStorageTask(task);
  }

  async deleteTask(taskId) {
    await this.isReady;
    const tasks = await this.getAllTasks(true);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;

    // Soft delete / tombstone for sync consistency
    task.deletedAt = Date.now();
    task.updatedAt = Date.now();
    await this.saveTask(task);
    return true;
  }

  async permanentlyDeleteTask(taskId) {
    await this.isReady;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.delete(taskId);
        req.onsuccess = () => {
          this._syncToLocalStorage();
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    }
    const list = this._getLocalStorageTasks(true).filter(t => t.id !== taskId);
    localStorage.setItem('synctask_tasks', JSON.stringify(list));
    return true;
  }

  // --- Categories Operations ---

  async getCategories() {
    await this.isReady;
    const defaultCategories = [
      { id: 'cat-all', name: 'All Tasks', icon: '📝', color: '#6366f1', system: true },
      { id: 'cat-work', name: 'Work', icon: '💼', color: '#3b82f6' },
      { id: 'cat-personal', name: 'Personal', icon: '👤', color: '#10b981' },
      { id: 'cat-shopping', name: 'Shopping', icon: '🛒', color: '#f59e0b' },
      { id: 'cat-study', name: 'Study', icon: '📚', color: '#ec4899' }
    ];

    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction('categories', 'readonly');
        const store = tx.objectStore('categories');
        const req = store.getAll();
        req.onsuccess = () => {
          if (req.result && req.result.length > 0) {
            resolve(req.result);
          } else {
            // Seed defaults
            this.saveCategories(defaultCategories).then(() => resolve(defaultCategories));
          }
        };
        req.onerror = () => resolve(defaultCategories);
      });
    }

    const local = localStorage.getItem('synctask_categories');
    if (local) {
      try { return JSON.parse(local); } catch (e) { return defaultCategories; }
    }
    localStorage.setItem('synctask_categories', JSON.stringify(defaultCategories));
    return defaultCategories;
  }

  async saveCategories(categories) {
    await this.isReady;
    if (this.db) {
      const tx = this.db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const cat of categories) {
        if (!cat.updatedAt) cat.updatedAt = Date.now();
        store.put(cat);
      }
    }
    localStorage.setItem('synctask_categories', JSON.stringify(categories));
    return categories;
  }

  // --- Settings & Metadata ---

  async getSetting(key, defaultValue = null) {
    await this.isReady;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction('settings', 'readonly');
        const store = tx.objectStore('settings');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
        req.onerror = () => {
          const val = localStorage.getItem('synctask_set_' + key);
          resolve(val !== null ? JSON.parse(val) : defaultValue);
        };
      });
    }
    const val = localStorage.getItem('synctask_set_' + key);
    return val !== null ? JSON.parse(val) : defaultValue;
  }

  async setSetting(key, value) {
    await this.isReady;
    if (this.db) {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({ key, value });
    }
    localStorage.setItem('synctask_set_' + key, JSON.stringify(value));
    return value;
  }

  // --- Batch Import & Merge for Sync ---

  async mergeTasks(incomingTasks) {
    await this.isReady;
    const currentTasks = await this.getAllTasks(true);
    const taskMap = new Map(currentTasks.map(t => [t.id, t]));
    let changeCount = 0;

    for (const incoming of incomingTasks) {
      if (!incoming || !incoming.id) continue;
      const existing = taskMap.get(incoming.id);

      // Last-Write-Wins based on updatedAt
      if (!existing || (incoming.updatedAt && incoming.updatedAt > (existing.updatedAt || 0))) {
        taskMap.set(incoming.id, incoming);
        changeCount++;
      }
    }

    if (changeCount > 0) {
      if (this.db) {
        const tx = this.db.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        for (const task of taskMap.values()) {
          store.put(task);
        }
      }
      localStorage.setItem('synctask_tasks', JSON.stringify(Array.from(taskMap.values())));
    }

    return {
      updated: changeCount,
      total: taskMap.size,
      tasks: Array.from(taskMap.values()).filter(t => !t.deletedAt)
    };
  }

  // --- LocalStorage Helpers ---

  _getLocalStorageTasks(includeDeleted) {
    try {
      const raw = localStorage.getItem('synctask_tasks');
      const list = raw ? JSON.parse(raw) : [];
      return includeDeleted ? list : list.filter(t => !t.deletedAt);
    } catch (e) {
      return [];
    }
  }

  _saveLocalStorageTask(task) {
    const list = this._getLocalStorageTasks(true);
    const idx = list.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      list[idx] = task;
    } else {
      list.push(task);
    }
    localStorage.setItem('synctask_tasks', JSON.stringify(list));
    return task;
  }

  async _syncToLocalStorage() {
    if (this.db) {
      const tasks = await this.getAllTasks(true);
      localStorage.setItem('synctask_tasks', JSON.stringify(tasks));
    }
  }

  // --- Backup & Export ---

  async exportData() {
    const tasks = await this.getAllTasks(true);
    const categories = await this.getCategories();
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      categories
    }, null, 2);
  }

  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.tasks && Array.isArray(data.tasks)) {
        await this.mergeTasks(data.tasks);
      }
      if (data.categories && Array.isArray(data.categories)) {
        await this.saveCategories(data.categories);
      }
      return true;
    } catch (e) {
      console.error('Import error:', e);
      return false;
    }
  }
}

// Global instance
window.storageEngine = new StorageEngine();

