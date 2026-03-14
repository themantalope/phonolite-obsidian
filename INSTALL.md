# Installing Phonolite for Obsidian

Phonolite is currently awaiting review for the Obsidian Community Plugins directory. In the meantime, you can install it in about a minute using either method below.

---

## Option 1: BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) is a free Obsidian plugin that makes installing and updating pre-release plugins easy. Once installed, it will notify you automatically when Phonolite updates are available.

1. Open Obsidian → **Settings** → **Community Plugins**
2. Make sure **Restricted mode** is off
3. Click **Browse** and search for **BRAT**, then install and enable it
4. Open **BRAT** settings and click **"Add Beta plugin"**
5. Paste this URL and click **Add plugin**:
   ```
   https://github.com/themantalope/phonolite-obsidian
   ```
6. Go back to **Community Plugins** and enable **Phonolite**

---

## Option 2: Manual Installation

1. Go to the [latest release](https://github.com/themantalope/phonolite-obsidian/releases/latest) on GitHub
2. Download these three files:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. In your vault, create the folder `.obsidian/plugins/phonolite/`
   - On macOS/Linux the `.obsidian` folder may be hidden — press **Cmd+Shift+.** to show hidden files
   - On Windows, enable **Show hidden items** in File Explorer
4. Move all three downloaded files into that folder
5. Open Obsidian → **Settings** → **Community Plugins** and enable **Phonolite**

> **Updating manually**: repeat steps 1–4 with the newer release files, then reload Obsidian.

---

## After Installing

1. Go to **Settings** → **Phonolite**
2. Enter your API key — get one at [phonolite.rocks/dashboard](https://phonolite.rocks/dashboard)
3. Click the Phonolite icon in the status bar (bottom of Obsidian) to start recording

---

## iOS Shortcut (optional)

You can start a Phonolite recording directly from your iPhone home screen or Lock Screen using the iOS Shortcuts app — no need to navigate inside Obsidian.

**Requirements**: the free [Obsidian Advanced URI](https://obsidian.md/plugins?id=obsidian-advanced-uri) community plugin must be installed in your vault.

**Setup**: create two home screen shortcuts — one to start, one to stop.

1. Install **Obsidian Advanced URI** via Community Plugins
2. Open Obsidian → **Settings** → **Phonolite** → scroll to **iOS Shortcuts**
3. Copy the **Start recording URL** and the **Stop recording URL**
4. In the **Shortcuts** app, create two shortcuts — each with a single **"Open URLs"** action
5. Add both to your Home Screen and place them side by side

For a full step-by-step walkthrough including Action Button and Back Tap setup, see [IOS_SHORTCUT_SETUP.md](IOS_SHORTCUT_SETUP.md).
