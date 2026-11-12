# SyncTask (Persona-themed to-do list)

Static PWA, no build step. Published to GitHub Pages from `main` (the whole repository is uploaded, so every tracked file is public).

## Layout

- `index.html`, `css/style.css` - the single page and all styling.
- `js/storage.js` - IndexedDB + localStorage; tasks, settings, last-write-wins merge on `updatedAt`, deletes are tombstones (`deletedAt`).
- `js/sync.js` - sync channels: private GitHub Gist (the durable cross-device store), encrypted live sync over a public MQTT broker, PeerJS P2P, optional local servers.
- `js/app.js` - UI wiring.
- `sw.js` - service worker cache.
- `server.js`, `api/sync.php` - optional self-hosted sync for a home network. No authentication: never expose them to the internet.
- `main.js` - Electron wrapper (optional; the installable PWA is the recommended desktop app).
- `tools/todo.mjs` - command-line access to the gist for Claude. `node tools/todo.mjs selftest` checks it.

## Rules

- **Nothing personal in the repository.** No tokens, gist IDs, room codes or real tasks in any file, default value, placeholder or example. Credentials live only in the browser's storage per device and in `~/.synctask.json` for the tool. A new visitor must start empty with every sync channel off.
- **No sync without the user's action.** Nothing may send task data on page load unless that device was configured by its user.
- **Data from other devices is untrusted.** Escape it with `escapeHtml` or set `textContent`; never put it in `innerHTML` raw.
- **No third-party request may carry task data or pairing codes** (this is why the QR-code service was removed).
- **After changing any file the page loads**, raise `CACHE_NAME` in `sw.js` and the `?v=` numbers in `index.html` together, or installed apps keep the old files.
- Task shape (keep the tool and the app identical): `id, title, priority (low|medium|high), category (Work|Personal|Shopping|Study), dueDate (YYYY-MM-DD or null), notes, completed, completedAt, subtasks, tags, createdAt, updatedAt, deletedAt?`.

## Checking a change

```bash
node tools/todo.mjs selftest
npm run server
```

Then open http://localhost:3001 and check the browser console.

## To-do list and daily summary

Use the `worklog` skill (`.claude/skills/worklog/`).
