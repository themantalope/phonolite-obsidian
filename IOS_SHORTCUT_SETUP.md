# iOS Shortcut Setup for Phonolite

Set up a single shortcut that does everything: records audio, saves it to your vault, and fires Phonolite to transcribe and create a note — all in one tap.

---

## How It Works

The shortcut has three steps:
1. **Record Audio** — iOS's native recorder. You see a big stop button. Tap it when you're done speaking.
2. **Save File** — saves the recording directly into your Obsidian vault's recordings folder.
3. **Open URL** — tells Phonolite to pick up the latest recording and run the full pipeline (transcribe → convert → note).

No separate stop button needed. The recording UI is built into the shortcut itself.

---

## Before You Start

You need two things installed in Obsidian:
- **Phonolite** (of course)
- **Obsidian Advanced URI** — free community plugin. Go to Settings → Community Plugins → Browse → search "Advanced URI" → Install → Enable.

You also need to know your **vault's recordings folder path** on your iPhone. By default Phonolite saves recordings to `phonolite/recordings/` inside your vault. The full path on iPhone depends on where your vault lives:

- **iCloud**: `iCloud Drive → Obsidian → [Your Vault Name] → phonolite → recordings`
- **Local (On My iPhone)**: `On My iPhone → Obsidian → [Your Vault Name] → phonolite → recordings`

---

## Step 1 — Copy Your URL

1. Open Obsidian on your iPhone
2. Go to **Settings → Phonolite** → scroll to **iOS Shortcuts**
3. Tap **Copy** next to "Transcribe latest recording URL"

---

## Step 2 — Build the Shortcut

1. Open the **Shortcuts** app → tap **+** (top right)

**Add action 1: Record Audio**
2. Tap **Add Action** → search **"Record Audio"** → tap it
3. Leave the default settings (it will record until you tap Stop)

**Add action 2: Save File**
4. Tap **+** below the first action → search **"Save File"** → tap it
5. Tap the file input field — it should reference the audio from the previous step
6. Turn **OFF** "Ask Where to Save"
7. Tap the folder path and navigate to your vault's recordings folder:
   - iCloud: `iCloud Drive → Obsidian → [Vault Name] → phonolite → recordings`
   - Local: `On My iPhone → Obsidian → [Vault Name] → phonolite → recordings`
   > If the `phonolite/recordings` folder doesn't exist yet, open Obsidian and make one recording via the mic button first — Phonolite creates the folder automatically.

**Add action 3: Wait**
8. Tap **+** → search **"Wait"** → tap it
9. Set the duration to **3 seconds**

> This gives iCloud time to finish writing the file before Phonolite reads it. Without this, the transcription may produce gibberish.

**Add action 4: Open URL**
10. Tap **+** → search **"Open URLs"** → tap it
11. Tap the blue URL field → paste your copied URL

**Name and save**
12. Tap the shortcut name at the top → rename it **"Phonolite"** (or anything you like)
13. Tap **Done**

---

## Step 3 — Add to Home Screen

1. Tap the **···** menu on your new shortcut → **Add to Home Screen**
2. Pick an icon and name
3. Tap **Add**

---

## Step 4 — Test It

1. Tap the shortcut on your home screen
2. The iOS recording UI appears — speak your note
3. Tap **Stop** when done
4. The shortcut saves the file and opens Obsidian briefly
5. Phonolite picks up the recording and processes it
6. Check your vault — a new note should appear within a few seconds

---

## Optional: Action Button (iPhone 15 Pro / 16 series)

Assign the shortcut to the Action Button for hardware-button recording:

1. Go to **Settings → Action Button**
2. Swipe to **Shortcut** → tap **Choose a Shortcut** → select your Phonolite shortcut
3. Press the Action Button to launch the recording UI

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No audio files found" notice | The Save File action is pointing to the wrong folder, or the folder doesn't exist yet — make one recording via Obsidian first |
| Shortcut can't find the recordings folder | Check that the folder path in the Save File action matches `recordingsFolder` in Phonolite settings |
| Obsidian opens but nothing happens | Make sure Obsidian Advanced URI is installed and enabled |
| Note never appears | Check your API key in Settings → Phonolite |
