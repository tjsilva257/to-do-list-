/**
 * SyncTask - Main Application Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- DOM Element References ---
  const tasksContainer = document.getElementById('tasksContainer');
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskPrioritySelect = document.getElementById('taskPrioritySelect');
  const taskCategorySelect = document.getElementById('taskCategorySelect');
  const taskDueDateInput = document.getElementById('taskDueDateInput');
  const btnAddTask = document.getElementById('btnAddTask');
  const searchInput = document.getElementById('searchInput');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const navItems = document.querySelectorAll('.nav-item');
  const btnToggleTheme = document.getElementById('btnToggleTheme');
  const themeIcon = document.getElementById('themeIcon');
  const btnInstallPwa = document.getElementById('btnInstallPwa');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const sidebar = document.getElementById('sidebar');

  // Sync Elements
  const btnOpenSyncModal = document.getElementById('btnOpenSyncModal');
  const syncModal = document.getElementById('syncModal');
  const btnCloseSyncModal = document.getElementById('btnCloseSyncModal');
  const btnCloseSyncModalFooter = document.getElementById('btnCloseSyncModalFooter');
  const syncDot = document.getElementById('syncDot');
  const syncText = document.getElementById('syncText');
  const mySyncCodeDisplay = document.getElementById('mySyncCodeDisplay');
  const btnCopySyncCode = document.getElementById('btnCopySyncCode');
  const qrCodeImg = document.getElementById('qrCodeImg');
  const qrLoading = document.getElementById('qrLoading');
  const remoteSyncCodeInput = document.getElementById('remoteSyncCodeInput');
  const btnConnectP2P = document.getElementById('btnConnectP2P');
  const connectedPeersList = document.getElementById('connectedPeersList');
  const serverApiUrlInput = document.getElementById('serverApiUrlInput');
  const btnTestServerSync = document.getElementById('btnTestServerSync');
  const btnRunServerSync = document.getElementById('btnRunServerSync');
  const serverSyncResult = document.getElementById('serverSyncResult');
  const btnExportJson = document.getElementById('btnExportJson');
  const importJsonFileInput = document.getElementById('importJsonFileInput');
  const btnBackup = document.getElementById('btnBackup');
  const btnSettings = document.getElementById('btnSettings');

  // Edit Modal Elements
  const editTaskModal = document.getElementById('editTaskModal');
  const btnCloseEditModal = document.getElementById('btnCloseEditModal');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const editTaskForm = document.getElementById('editTaskForm');
  const editTaskTitle = document.getElementById('editTaskTitle');
  const editTaskNotes = document.getElementById('editTaskNotes');
  const editTaskPriority = document.getElementById('editTaskPriority');
  const editTaskCategory = document.getElementById('editTaskCategory');
  const editTaskDueDate = document.getElementById('editTaskDueDate');

  // Counts Elements
  const countAll = document.getElementById('countAll');
  const countToday = document.getElementById('countToday');
  const countUpcoming = document.getElementById('countUpcoming');
  const countCompleted = document.getElementById('countCompleted');

  // --- App State ---
  let currentFilter = 'all'; // all, today, upcoming, completed, active, high, category:XYZ
  let searchQuery = '';
  let editingTaskId = null;
  let deferredInstallPrompt = null;

  // --- Toast Helper ---
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'sync') icon = '🔄';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- Theme Management ---
  const savedTheme = await window.storageEngine.getSetting('theme', 'dark');
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

  btnToggleTheme.addEventListener('click', async () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    themeIcon.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    await window.storageEngine.setSetting('theme', newTheme);
  });

  // --- Mobile Sidebar Toggle ---
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== btnToggleSidebar) {
        sidebar.classList.remove('open');
      }
    });
  }

  // --- PWA Installation ---
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstallPwa.classList.add('visible');
  });

  btnInstallPwa.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        showToast('SyncTask installed successfully!', 'success');
      }
      deferredInstallPrompt = null;
      btnInstallPwa.classList.remove('visible');
    }
  });

  // --- Render Tasks ---
  async function renderTasks() {
    const allTasks = await window.storageEngine.getAllTasks(false);

    // Update Counter Badges
    const todayStr = new Date().toISOString().split('T')[0];
    let totalActive = 0;
    let todayCount = 0;
    let upcomingCount = 0;
    let completedCount = 0;

    allTasks.forEach(t => {
      if (t.completed) {
        completedCount++;
      } else {
        totalActive++;
        if (t.dueDate === todayStr) todayCount++;
        else if (t.dueDate && t.dueDate > todayStr) upcomingCount++;
      }
    });

    if (countAll) countAll.textContent = allTasks.length;
    if (countToday) countToday.textContent = todayCount;
    if (countUpcoming) countUpcoming.textContent = upcomingCount;
    if (countCompleted) countCompleted.textContent = completedCount;

    // Filter Tasks
    let filtered = allTasks.filter(t => {
      // Category / View Filter
      if (currentFilter === 'active' && t.completed) return false;
      if (currentFilter === 'completed' && !t.completed) return false;
      if (currentFilter === 'today' && (t.dueDate !== todayStr || t.completed)) return false;
      if (currentFilter === 'upcoming' && (!t.dueDate || t.dueDate <= todayStr || t.completed)) return false;
      if (currentFilter === 'high' && (t.priority !== 'high' || t.completed)) return false;
      if (currentFilter.startsWith('category:')) {
        const cat = currentFilter.replace('category:', '');
        if (t.category !== cat) return false;
      }

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchNotes = t.notes && t.notes.toLowerCase().includes(q);
        const matchCategory = t.category && t.category.toLowerCase().includes(q);
        return matchTitle || matchNotes || matchCategory;
      }

      return true;
    });

    // Sort: Uncompleted first, then by priority (high > medium > low), then by due date
    const priorityWeights = { high: 3, medium: 2, low: 1 };
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pDiff = (priorityWeights[b.priority] || 2) - (priorityWeights[a.priority] || 2);
      if (pDiff !== 0) return pDiff;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // Render HTML
    if (filtered.length === 0) {
      tasksContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✨</div>
          <h3>No tasks found</h3>
          <p>You're all caught up! Add a new task above or adjust your filters.</p>
        </div>
      `;
      return;
    }

    tasksContainer.innerHTML = filtered.map(task => {
      const isOverdue = task.dueDate && task.dueDate < todayStr && !task.completed;
      const isDueToday = task.dueDate === todayStr && !task.completed;
      let dateBadgeClass = '';
      let dateBadgeText = task.dueDate || '';

      if (isDueToday) {
        dateBadgeClass = 'today';
        dateBadgeText = '📅 Today';
      } else if (isOverdue) {
        dateBadgeClass = 'overdue';
        dateBadgeText = `⚠️ Overdue (${task.dueDate})`;
      }

      const priorityLabel = task.priority ? task.priority.toUpperCase() : 'MEDIUM';

      return `
        <article class="task-card ${task.completed ? 'completed' : ''}" data-id="${task.id}">
          <label class="task-checkbox-container" title="${task.completed ? 'Mark incomplete' : 'Mark complete'}">
            <input type="checkbox" class="task-checkbox-input" ${task.completed ? 'checked' : ''} data-action="toggle">
          </label>

          <div class="task-details">
            <div class="task-header-row">
              <span class="task-title">${escapeHtml(task.title)}</span>
              <div class="task-actions">
                <button class="btn-task-action" data-action="edit" title="Edit task">✏️</button>
                <button class="btn-task-action delete" data-action="delete" title="Delete task">🗑️</button>
              </div>
            </div>

            <div class="task-badges">
              <span class="badge badge-priority-${task.priority || 'medium'}">${priorityLabel}</span>
              ${task.category ? `<span class="badge badge-category">📁 ${escapeHtml(task.category)}</span>` : ''}
              ${task.dueDate ? `<span class="badge badge-date ${dateBadgeClass}">${dateBadgeText}</span>` : ''}
            </div>

            ${task.notes ? `<div class="task-notes-snippet">${escapeHtml(task.notes)}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Add Task Handler ---
  async function handleAddTask() {
    const title = taskTitleInput.value.trim();
    if (!title) return;

    const priority = taskPrioritySelect.value;
    const category = taskCategorySelect.value;
    const dueDate = taskDueDateInput.value;

    const newTask = {
      title,
      priority,
      category,
      dueDate: dueDate || null,
      notes: '',
      completed: false,
      subtasks: []
    };

    const saved = await window.storageEngine.saveTask(newTask);
    taskTitleInput.value = '';
    taskDueDateInput.value = '';

    await renderTasks();
    showToast(`Task "${title}" added!`, 'success');

    // Broadcast change to connected peers
    window.syncEngine.broadcastLiveChange(saved);

    // Optional server sync in background if configured
    if (window.syncEngine.apiUrl) {
      window.syncEngine.syncWithServer().catch(() => {});
    }
  }

  btnAddTask.addEventListener('click', handleAddTask);
  taskTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  // --- Task Card Event Delegation (Complete, Edit, Delete) ---
  tasksContainer.addEventListener('click', async (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const taskId = card.getAttribute('data-id');
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');

    if (action === 'toggle') {
      const allTasks = await window.storageEngine.getAllTasks(false);
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        task.completed = actionBtn.checked;
        task.updatedAt = Date.now();
        await window.storageEngine.saveTask(task);

        if (task.completed && typeof confetti === 'function') {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.8 }
          });
        }

        await renderTasks();
        window.syncEngine.broadcastLiveChange(task);
      }
    } else if (action === 'edit') {
      const allTasks = await window.storageEngine.getAllTasks(false);
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        editingTaskId = task.id;
        editTaskTitle.value = task.title || '';
        editTaskNotes.value = task.notes || '';
        editTaskPriority.value = task.priority || 'medium';
        editTaskCategory.value = task.category || 'Work';
        editTaskDueDate.value = task.dueDate || '';
        editTaskModal.showModal();
      }
    } else if (action === 'delete') {
      await window.storageEngine.deleteTask(taskId);
      showToast('Task deleted', 'info');
      await renderTasks();

      const allTasks = await window.storageEngine.getAllTasks(true);
      const tombstone = allTasks.find(t => t.id === taskId);
      if (tombstone) {
        window.syncEngine.broadcastLiveChange(tombstone);
      }
    }
  });

  // --- Edit Modal Handlers ---
  function closeEditModal() {
    editTaskModal.close();
    editingTaskId = null;
  }

  btnCloseEditModal.addEventListener('click', closeEditModal);
  btnCancelEdit.addEventListener('click', closeEditModal);

  editTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingTaskId) return;

    const allTasks = await window.storageEngine.getAllTasks(false);
    const task = allTasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = editTaskTitle.value.trim();
      task.notes = editTaskNotes.value.trim();
      task.priority = editTaskPriority.value;
      task.category = editTaskCategory.value;
      task.dueDate = editTaskDueDate.value || null;
      task.updatedAt = Date.now();

      await window.storageEngine.saveTask(task);
      closeEditModal();
      await renderTasks();
      showToast('Task updated!', 'success');
      window.syncEngine.broadcastLiveChange(task);
    }
  });

  // --- Search & Filters ---
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTasks();
  });

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-tab');
      renderTasks();
    });
  });

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentFilter = item.getAttribute('data-filter');
      renderTasks();
      if (window.innerWidth <= 820) {
        sidebar.classList.remove('open');
      }
    });
  });

  // --- Sync Modal & Tabs ---
  function openSyncModal() {
    syncModal.showModal();
    initP2PDisplay();
    serverApiUrlInput.value = window.syncEngine.apiUrl;
  }

  btnOpenSyncModal.addEventListener('click', openSyncModal);
  if (btnSettings) btnSettings.addEventListener('click', openSyncModal);
  btnCloseSyncModal.addEventListener('click', () => syncModal.close());
  btnCloseSyncModalFooter.addEventListener('click', () => syncModal.close());

  const syncTabBtns = document.querySelectorAll('.sync-tab-btn');
  const syncTabContents = document.querySelectorAll('.sync-tab-content');

  syncTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      syncTabBtns.forEach(b => b.classList.remove('active'));
      syncTabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-synctab');
      if (targetTab === 'p2p') document.getElementById('tabContentP2p').classList.add('active');
      if (targetTab === 'local') document.getElementById('tabContentLocal').classList.add('active');
      if (targetTab === 'backup') document.getElementById('tabContentBackup').classList.add('active');
    });
  });

  // --- P2P WebRTC Handling ---
  async function initP2PDisplay() {
    mySyncCodeDisplay.textContent = 'Starting P2P...';
    try {
      const code = await window.syncEngine.startP2P();
      if (code) {
        mySyncCodeDisplay.textContent = code.toUpperCase();
        syncDot.className = 'sync-dot online';
        syncText.textContent = `P2P Ready: ${code.toUpperCase()}`;

        // Generate QR code for mobile scanning
        const connectUrl = window.location.href.split('?')[0] + `?connect=${code}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(connectUrl)}`;
        qrCodeImg.src = qrUrl;
        qrCodeImg.onload = () => {
          qrCodeImg.style.display = 'block';
          qrLoading.style.display = 'none';
        };
      } else {
        mySyncCodeDisplay.textContent = 'P2P Offline';
      }
    } catch (e) {
      mySyncCodeDisplay.textContent = 'Error starting P2P';
    }
  }

  btnCopySyncCode.addEventListener('click', () => {
    const code = mySyncCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
      showToast('Sync Code copied to clipboard!', 'success');
    });
  });

  btnConnectP2P.addEventListener('click', async () => {
    const code = remoteSyncCodeInput.value.trim();
    if (!code) {
      showToast('Please enter a sync code', 'error');
      return;
    }

    btnConnectP2P.disabled = true;
    btnConnectP2P.textContent = 'Connecting...';

    try {
      await window.syncEngine.connectToDevice(code);
      showToast(`Connected to device ${code.toUpperCase()}!`, 'success');
      remoteSyncCodeInput.value = '';
    } catch (err) {
      showToast(err.message || 'Connection failed', 'error');
    } finally {
      btnConnectP2P.disabled = false;
      btnConnectP2P.textContent = 'Connect & Sync';
    }
  });

  // Listen for sync engine events
  window.syncEngine.onSyncEvent((event, data) => {
    if (event === 'device_connected') {
      showToast(`Device paired! Syncing tasks...`, 'sync');
      syncDot.className = 'sync-dot online';
      syncText.textContent = `${data.total} device(s) connected`;
      connectedPeersList.textContent = `🟢 Connected to ${data.peer.toUpperCase()} (${data.total} active)`;
    } else if (event === 'device_disconnected') {
      connectedPeersList.textContent = data.total > 0 ? `🟢 ${data.total} connected device(s)` : '';
      if (data.total === 0) {
        syncText.textContent = `P2P Ready: ${window.syncEngine.peerId.toUpperCase()}`;
      }
    } else if (event === 'tasks_synced') {
      showToast(`Synchronized ${data.count} task(s)!`, 'sync');
      renderTasks();
    }
  });

  // Check URL parameter for instant QR pairing (?connect=st-xyz)
  const urlParams = new URLSearchParams(window.location.search);
  const autoConnectCode = urlParams.get('connect');
  if (autoConnectCode) {
    setTimeout(async () => {
      showToast(`Attempting to pair with ${autoConnectCode.toUpperCase()}...`, 'sync');
      try {
        await window.syncEngine.connectToDevice(autoConnectCode);
        showToast(`Paired with ${autoConnectCode.toUpperCase()}!`, 'success');
      } catch (err) {
        console.warn('Auto pair error:', err);
      }
    }, 1500);
  }

  // --- Local Server Sync ---
  btnTestServerSync.addEventListener('click', async () => {
    const url = serverApiUrlInput.value.trim();
    if (!url) return;
    serverSyncResult.textContent = 'Testing connection...';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping' })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        serverSyncResult.innerHTML = `<span style="color: var(--success)">✅ Connected to ${data.server}!</span>`;
        await window.storageEngine.setSetting('apiUrl', url);
        window.syncEngine.apiUrl = url;
      } else {
        serverSyncResult.innerHTML = `<span style="color: var(--danger)">❌ Invalid server response</span>`;
      }
    } catch (e) {
      serverSyncResult.innerHTML = `<span style="color: var(--danger)">❌ Connection failed: ${e.message}</span>`;
    }
  });

  btnRunServerSync.addEventListener('click', async () => {
    const url = serverApiUrlInput.value.trim();
    if (url) {
      await window.storageEngine.setSetting('apiUrl', url);
      window.syncEngine.apiUrl = url;
    }
    serverSyncResult.textContent = 'Synchronizing...';
    const result = await window.syncEngine.syncWithServer();
    if (result.success) {
      serverSyncResult.innerHTML = `<span style="color: var(--success)">✅ Synced! (${result.updated} updated)</span>`;
      renderTasks();
    } else {
      serverSyncResult.innerHTML = `<span style="color: var(--danger)">❌ Sync failed: ${result.error}</span>`;
    }
  });

  // --- Backup & Restore ---
  btnExportJson.addEventListener('click', async () => {
    const jsonStr = await window.storageEngine.exportData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synctask-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded!', 'success');
  });

  if (btnBackup) btnBackup.addEventListener('click', () => btnExportJson.click());

  importJsonFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const ok = await window.storageEngine.importData(text);
    if (ok) {
      showToast('Backup restored successfully!', 'success');
      await renderTasks();
      syncModal.close();
    } else {
      showToast('Failed to parse backup file', 'error');
    }
    e.target.value = '';
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== taskTitleInput && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // --- Initial Launch ---
  await renderTasks();
  initP2PDisplay(); // auto-start P2P listening in background
});

