# datac — a local, Notion-style notes app

`datac` turns **any folder** into a private notes workspace. Run one command in a
project folder and it opens a block-based editor in your browser — pages, sub-pages,
columns, tables, files, comments, status, and more. Everything is stored **locally**
as JSON on your machine. No accounts, no cloud, no build step.

One always-running local server (a small, dependency-free Node daemon) serves every
workspace at `http://localhost:4321`.

---

## Requirements

- **macOS** (some features — the native file picker, "open file/folder", and the
  double-click `.dc` handler — use macOS tools). The editor itself works in any
  modern browser.
- **[Node.js](https://nodejs.org)** 18 or newer. Check with `node --version`.

---

## Install

```bash
# 1. Get the code
git clone https://github.com/techkush/datac.git
cd datac

# 2. Install (copies the app to ~/.datac/app and puts a `datac` command on your PATH)
sh install.sh
```

If you downloaded a ZIP instead of cloning, just `cd` into the unzipped folder and run
`sh install.sh`.

The installer:
- copies the app into `~/.datac/app` (self-contained — the source folder is only used
  for installing/updating),
- creates a `datac` command in a folder on your `PATH` (`/usr/local/bin`,
  `/opt/homebrew/bin`, or `~/.local/bin`).

If it installs to `~/.local/bin` and that isn't on your `PATH`, add this to `~/.zshrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Verify it worked:

```bash
datac help
```

---

## Use it

```bash
cd ~/projects/my-notes
datac init "My Notes"     # creates ./dataC + ./open.dc, starts the app, opens the browser
```

Later, to reopen that folder's notes:

```bash
cd ~/projects/my-notes
datac open                # or:  datac open /path/to/my-notes
```

Every folder you `datac init` is its **own workspace**, all served by the one background
daemon. Visit **http://localhost:4321** for the home page listing all your workspaces
(with a type-to-confirm **Delete** for each).

### Optional: double-click `open.dc` to open notes (macOS)

```bash
datac finder-install
```

Registers a small `DataC.app` so double-clicking an `open.dc` opens that workspace in
the browser. (If you have [`duti`](https://github.com/moretension/duti) it's set as the
default automatically; otherwise do a one-time *Get Info → Open With → DataC → Change All*.)

---

## Commands

| Command | What it does |
|---|---|
| `datac init [title]` | Create `dataC/` + `open.dc` here and open it |
| `datac open [path]` | Open an existing workspace (folder or `open.dc`) |
| `datac list` | List registered workspaces |
| `datac start` / `stop` / `restart` | Manage the background daemon |
| `datac status` | Show daemon status |
| `datac finder-install` | (macOS) enable double-click on `open.dc` |
| `datac help` | Show help |

The daemon starts automatically on `init` / `open`, so you rarely need `start`/`stop`.

---

## Editor features

- **Blocks** — text, Heading 1–4, bulleted / numbered / to-do lists, quote, code,
  divider. Hover a block for a `+` (add line) and `⋮⋮` (drag / menu: delete, duplicate,
  turn into, text & background colors).
- **Slash menu** — press `/` to insert any block, plus **columns** (2–5), **tables**,
  **images**, **files**, and page links.
- **Pages & sub-pages** — `/Page` makes a nested sub-page (shown as a tree in the
  sidebar with a status dot); `/Link to page` links to an existing page. Breadcrumbs
  navigate up the tree; deleted sub-pages go to an **Orphaned pages** section and can be
  restored or re-added to their parent.
- **Files** — upload into `dataC/files/`, or **link a file by path** (no copy) that
  opens in its default app. Each file can carry a note.
- **Page tab bar** — a colored **status** dropdown (Not started / Writing / Reviewing /
  Revising / Done) and **Export Markdown** (recursively includes sub-pages).
- **Cover image + emoji icon** per page, comments on section dividers, full undo/redo,
  autosave, and light/dark theme.
- Paste from other apps keeps formatting (bold, colors, tables, links).

---

## Where your data lives

| Path | Purpose |
|---|---|
| `<project>/dataC/<id>.json` | your pages (one JSON file each) |
| `<project>/dataC/files/` | uploaded images & attachments |
| `<project>/open.dc` | manifest pointing to this workspace |
| `~/.datac/app/` | the installed app (server + UI) |
| `~/.datac/workspaces.json` | registry of all workspaces |
| `~/.datac/daemon.log` | daemon log |

Your notes are **not** inside the source/installed app folder — they stay in each
project's own `dataC/`. You can move or delete the source repo and the installed app
without affecting your notes.

---

## Update

Pull/download the latest code and re-run the installer from the source folder:

```bash
git pull        # (or download the new version)
sh install.sh
datac restart
```

---

## Uninstall

```bash
datac stop
rm -rf ~/.datac                       # app + registry (NOT your project notes)
rm -f "$(command -v datac)"           # the datac command
rm -rf ~/Applications/DataC.app       # if you ran finder-install
```

Your notes stay in each project's `dataC/` folder until you delete them yourself.

---

## Notes

- This is a **localhost-only** app with no authentication — the right trade-off for a
  personal, single-user tool. Don't expose port 4321 to a network without adding
  safeguards.
- The native file picker, open-file/folder, and `.dc` double-click use macOS
  (`osascript` / `open`). On other platforms the editor works, but those specific
  actions are no-ops until platform equivalents are added.
