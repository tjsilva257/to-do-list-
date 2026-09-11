
# 📝 SyncTask

> **A modern, responsive, cross-device To-Do List application with real-time peer-to-peer sync, local Wi-Fi sync, offline-first storage, and automated desktop releases.**

![SyncTask Banner](assets/icon.svg)

---

## ✨ Key Features

- **📱 True Cross-Device Support**: Run on Windows, macOS, Linux, Android, and iOS.
- **🔄 Real-Time Peer-to-Peer Sync**: Instant live synchronization between devices using WebRTC (PeerJS). Connect phone and computer simply by scanning a QR code or typing a 6-character code—**no account or complex server configuration required**!
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

## 🔄 How to Synchronize Tasks Across Devices

### Option 1: Instant P2P Sync (Zero Setup, Anywhere)
1. Open SyncTask on **Device 1** (e.g., your PC) and click **"Sync Devices"**.
2. A unique 6-character code (e.g. `ST-8X2K`) and a QR Code will appear.
3. Open SyncTask on **Device 2** (e.g., your phone):
   - Either scan the QR code with your phone camera, OR
   - Click **"Sync Devices"**, enter the code into *"Connect to Another Device"*, and click **"Connect & Sync"**.
4. Both devices are now paired! Any task you add, edit, or complete will instantly sync in real-time across both screens.

### Option 2: Local Wi-Fi Sync (Via XAMPP)
1. Place this project in your XAMPP `htdocs` folder (`c:\xampp\htdocs\to-do-list-`).
2. Start Apache in your XAMPP Control Panel.
3. Find your computer's local IP address (run `ipconfig` in terminal, e.g. `192.168.1.15`).
4. On your other devices connected to the same Wi-Fi, open:
   `http://192.168.1.15/to-do-list-/`
5. All devices will automatically communicate with the central database (`api/sync.php`)!

### Option 3: Manual Backup & Restore
- Click the **💾 Backup** button in the bottom-left sidebar to download your tasks as a `.json` file.
- Open SyncTask on another device, click **"Restore Backup"**, and select the `.json` file to merge your tasks.

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

