# iOS Shortcut Setup for Phonolite

Set up two home screen shortcuts — one to start recording, one to stop. They sit side by side and work like physical buttons.

---

## Before You Start

You need two things installed in Obsidian:
- **Phonolite** (of course)
- **Obsidian Advanced URI** — free community plugin. Go to Settings → Community Plugins → Browse → search "Advanced URI" → Install → Enable.

---

## Step 1 — Get Your URLs

1. Open Obsidian on your iPhone
2. Go to **Settings → Phonolite**
3. Scroll down to **iOS Shortcuts**
4. Tap **Copy** next to **Start recording URL** — paste it somewhere temporary (Notes app, etc.)
5. Tap **Copy** next to **Stop recording URL** — paste it too

You now have two URLs. Keep them handy for the next steps.

---

## Step 2 — Create the Start Shortcut

1. Open the **Shortcuts** app
2. Tap **+** (top right)
3. Tap **Add Action**
4. Search for **"Open URLs"** → tap it
5. Tap the blue **URL** field → paste your **Start recording URL**
6. Tap the shortcut name at the top → rename it **"Record"**
7. Tap **Done**

---

## Step 3 — Add the Start Shortcut to Your Home Screen

1. In the Shortcuts app, find your **Record** shortcut
2. Tap the **···** menu (three dots) on the shortcut tile
3. Tap **Add to Home Screen**
4. Change the icon if you like — a red circle 🔴 works well
5. Tap **Add**

---

## Step 4 — Create the Stop Shortcut

Repeat the same process with your Stop recording URL:

1. Tap **+** in Shortcuts
2. Add an **Open URLs** action
3. Paste your **Stop recording URL**
4. Name it **"Stop"**
5. Tap **Done**
6. Tap **···** → **Add to Home Screen**
7. Use a different icon — a square ⏹ works well
8. Tap **Add**

---

## Step 5 — Arrange Them on Your Home Screen

Move the two icons so they sit side by side. They act like a pair of physical buttons — tap **Record** to start, tap **Stop** when you're done.

---

## Step 6 — Test It

1. Tap **Record** — Obsidian opens and recording starts. You'll see a "🔴 Recording started" notice.
2. Speak your note.
3. Tap **Stop** — Obsidian briefly comes to the front, recording stops, and Phonolite processes your audio.
4. Check your vault — a new note should appear within a few seconds.

> **First-time permission**: iOS may ask "Open in Obsidian?" the first time you tap each shortcut. Tap **Open**. It won't ask again after that.

---

## Optional: Action Button (iPhone 15 Pro / 16 series)

If your iPhone has an Action Button on the left side, you can assign it to toggle recording — no screen needed.

1. Go to **Settings → Action Button**
2. Swipe to **Shortcut**
3. Tap **Choose a Shortcut** → select your **Record** shortcut (or create a new one using the Toggle recording URL from Phonolite settings)
4. Press the Action Button once to start, press again to stop

---

## Optional: Back Tap (any iPhone, iOS 14+)

Double or triple-tap the back of your phone to trigger a shortcut. Useful if you want to stop recording without looking at your screen.

1. Go to **Settings → Accessibility → Touch → Back Tap**
2. Tap **Double Tap** → scroll to **Shortcuts** → select **Stop**
3. Now double-tap the back of your phone to stop recording from anywhere

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Shortcut does nothing | Make sure Obsidian Advanced URI is installed and enabled |
| "Vault not found" error | Re-copy the URLs from Phonolite settings — they are generated fresh each time |
| Recording starts but note never appears | Check that your Phonolite API key is set in Settings → Phonolite |
| iOS keeps asking "Open in Obsidian?" | This stops after a few uses — it's a one-time iOS security prompt per shortcut |
