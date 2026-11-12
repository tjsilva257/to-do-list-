
# 📝 SyncTask

> **A modern, responsive, cross-device To-Do List application with real-time peer-to-peer sync, local Wi-Fi sync, offline-first storage, and automated desktop releases.**

![SyncTask Banner](assets/icon.svg)

---

## ✨ Key Features

- **📱 True Cross-Device Support**: Run on Windows, macOS, Linux, Android, and iOS.
- **🔄 Real-Time Peer-to-Peer Sync**: Instant live synchronization between devices using WebRTC (PeerJS). Connect phone and computer by typing a pairing code—**no account or server required**.
- **🏠 Local Wi-Fi & XAMPP Sync**: Built-in PHP & SQLite REST backend (`api/sync.php`) allowing all devices on your home or office Wi-Fi to synchronize effortlessly.
- **💾 Offline-First Architecture**: 100% functional without an internet connection using IndexedDB and LocalStorage. Tombstone tracking (`deletedAt`) and timestamp-based conflict resolution prevent data loss.
- **📦 Downloadable Releases**: Packaged as a standalone Windows desktop application (`.exe`) via Electron and GitHub Releases.
- **📲 Progressive Web App (PWA)**: Installable on phones and tablets with one click ("Add to Home Screen" or "Install App"), complete with app icon and full-screen experience.
- **🎯 Task Organization**:
  - Categories: Work, Personal, Shopping, Study, and custom lists.
  - Priority Flags: High (🔴), Medium (🟡), Low (🟢).
  - Smart Filters: Today, Upcoming, High Priority, Completed, and Active.
  - Due Dates with dynamic badges (Due Today, Overdue alerts).
  - Search & Live Filtering.
  - Subtask notes and celebration confetti upon completion!
- **🌗 Dark & Light Themes**: Sleek glassmorphic UI with customizable theme toggle.
- **💾 Backup & Restore**: Instant JSON export and restore for easy backups or offline file transfer.

---

## 🚀 How to Download on Other Devices

### 1. Windows Desktop Application (`.exe`)
1. Go to the [Releases](https://github.com/tjsilva257/to-do-list-/releases) page on your GitHub repository.
2. Download `SyncTask-Setup-1.0.0.exe` (or the portable `.exe`).
3. Run the installer and launch SyncTask right from your Windows desktop or Start menu!

### 2. Mobile (Android & iPhone / iPad) & Mac / Linux
SyncTask is a **Progressive Web App (PWA)**:
1. Open the app link in your mobile browser (either your GitHub Pages link `https://tjsilva257.github.io/to-do-list-/` or your local Wi-Fi IP `http://<your-pc-ip>/to-do-list-/`).
2. **On Android (Chrome)**: Tap the **"📱 Install App"** button at the top, or tap the menu `⋮` and select **"Install app"**.
3. **On iPhone / iPad (Safari)**: Tap the Share button 📤 and select **"Add to Home Screen"**.
4. The app icon will appear directly on your home screen and open in full screen just like a native app!

---

## 🔒 Privacy

The app starts empty. Nothing is synced and no account is connected until you set it up on your own device. Tokens, Gist IDs and room codes are saved only in that device's browser storage, never in this repository. If you fork or host this repo, you bring your own.

---

## 🔄 How to Synchronize Tasks Across Devices

### Option 1: 24/7 Cloud Sync (private GitHub Gist) — recommended
1. On GitHub, create a personal access token with only the **gist** permission.
2. First device: open **Sync → 24/7 Cloud Gist**, paste the token, leave the Gist ID empty and press **Sync Now**. The app creates a secret gist and shows its ID.
3. Other devices: paste the same token **and** that Gist ID, then press **Sync Now**.

Keep the Gist ID to yourself: a secret gist can be read by anyone who has its ID.

### Option 2: Live Sync (instant, end-to-end encrypted)
1. Open **Sync → Live WebSocket** and press 🎲 to create a private room.
2. Press **Copy Pairing Link** and open that link on your other device (send it to yourself privately). The room code is the encryption key, so treat it like a password.

Live sync only works while both devices have the app open; use Option 1 as well so nothing is missed.

### Option 3: Direct P2P
Open **Sync → P2P WebRTC** on both devices and type one device's code into the other. The receiving device asks before it accepts.

### Option 4: Home network server
`npm run server` (Node) or `api/sync.php` (XAMPP) keep a copy on your own PC. They have no login, so use them only on a network you trust and never expose them to the internet.

### Option 5: Manual Backup & Restore
**Sync → Backup Log** downloads or restores a `.json` file.

---

## 🤖 Use it with Claude

`tools/todo.mjs` lets Claude Code read and update the same private gist:

1. Set up Option 1 above.
2. Create `~/.synctask.json` (in your home folder, not in this repo):
   ```json
   { "token": "<your gist token>", "gistId": "<your Gist ID>" }
   ```
3. Try `node tools/todo.mjs list`.

The `worklog` skill in `.claude/skills/` then lets you ask Claude things like "add what we did to my to-do list" or "write my daily summary". Tasks Claude adds show up the next time the app syncs.

---

## 🛠️ Developer Setup & Packaging

### Run in Browser
Simply open `index.html` in any browser, or serve it via XAMPP Apache:
```bash
http://localhost/to-do-list-/
```

### Run as Desktop App
```bash
# Install dependencies
npm install

# Launch Electron desktop window
npm start
```

### Build Windows Release (`.exe`)
```bash
npm run package
```
The standalone installer and portable executables will be output to the `dist/` directory!

---

## 🤖 Automated GitHub Actions Releases

Whenever you are ready to publish a new release:
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub Actions will automatically:
1. Build the Windows installer and portable `.exe`.
2. Create a official release on GitHub under [Releases](https://github.com/tjsilva257/to-do-list-/releases).
3. Attach the `.exe` and `.zip` packages for direct download by you or anyone else!

---

## 📜 License
MIT License. Free for personal and commercial use.

