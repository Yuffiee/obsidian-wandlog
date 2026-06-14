# Wandlog

> Stroll through notes, mark your days.

A plugin for Obsidian (https://obsidian.md) that combines a daily writing heatmap, random note discovery, and task management — all in one sidebar view.

## Features

### 📊 Heatmap
Track your daily writing volume with a GitHub-style contribution heatmap. Each cell shows how many words you wrote that day. Click any cell to jump to the corresponding daily note.

- **Multiple color schemes**: Default, Ocean, Lavender, Sunset, Mint
- **Customizable daily word target**
- **Auto-scales** to fit your sidebar width

### 🎲 Random Card
Discover forgotten gems from your notes. Displays a random list item from your vault — click to open the source file, or tap the dice button for another.

- **One card at a time** — clean, focused display
- **Right-click** to copy text or delete the item
- **Skip folders** you don't want to browse

### ☑️ Todo
Find and manage unchecked tasks from your notes. Scans specified folders for `- [ ]` format tasks and displays them in a checklist.

- **Click checkbox** to mark a task complete (writes `[x]` to the file)
- **Right-click** to copy or delete
- **Auto-refreshes** when files change

## Installation

### From Obsidian Community Plugins (once published)
1. Open Settings → Community Plugins
2. Browse and search for "Wandlog"
3. Install and enable

### Manual (BRAT)
1. Install the [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin
2. Add the repository URL: `your-username/obsidian-wandlog`
3. Enable Wandlog

### Manual (development)
1. Clone this repo to `<vault>/.obsidian/plugins/wandlog/`
2. Run `npm install` then `npm run build`
3. Enable the plugin in Obsidian settings

## Settings

| Setting | Description |
|---|---|
| Track Folders | Folders to scan for daily word count |
| Daily Target | Word count goal for heatmap coloring |
| Color Scheme | Heatmap color palette |
| Exclude Folders | Folders the random card will skip |
| Todo Folders | Folders to search for unchecked tasks |
| Open In | Open cells/cards/tasks in new tab or current tab |

## Development

```bash
npm install         # Install dependencies
npm run dev         # Watch mode (auto-rebuild on changes)
npm run build       # Production build
```

## License

MIT
