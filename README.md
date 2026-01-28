
# Weekly Planner — Gist Sync PWA

A minimal, installable PWA (Vite + React + TS + Tailwind + vite-plugin-pwa) that syncs
your weekly tasks to a single **private GitHub Gist** JSON file.

## Quick start
```bash
npm install
npm run dev
```

Then open the app → **Settings** → paste your GitHub token (gist scope) and your Gist ID.

### Create your Gist
- Go to GitHub → Gists → New secret gist
- File name: `planner.json`
- Content:
```json
{ "version": 1, "tasks": [], "updatedAt": 0 }
```
- Copy the Gist ID from the URL

### Token
- Create a Personal Access Token with only the **gist** scope (fine-grained or classic)
- Paste it in Settings (stored locally in your browser via localStorage)

## Build PWA
```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host (GitHub Pages, Netlify, Cloudflare Pages).
The app works offline; it updates itself when you revisit (service worker autoUpdate).

## Data & Conflicts
- Local cache is stored in `localStorage` as `planner_cache`
- Sync uses ETag and merges by `task.id`, choosing the higher `updatedAt`
- Gist keeps a history of revisions if you need to roll back

## Notes
- This app is single-user by design. Keep your gist **secret**.
- If you later want real local notifications, wrap the PWA with Capacitor.




To run

```bash
npm run build
cp dist/index.html dist/404.html

git worktree add gh-pages
rm -rf gh-pages/*
cp -r dist/* gh-pages/
cd gh-pages
git add .
git commit -m "update: gist"
git push origin HEAD:gh-pages
cd ..
git worktree remove gh-pages
```