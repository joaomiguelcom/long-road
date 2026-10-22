# Long Road

João Miguel's concert archive: an automatic backup of [setlist.fm/concerts/ojoaomiguel](https://www.setlist.fm/concerts/ojoaomiguel) plus a small app to browse it.

## How it works

- `export.ps1` reads every attended concert from the setlist.fm API and writes to `data/`:
  - `raw-attended.json`: full backup, exactly as the API returns it
  - `concerts.json`: clean list used by the app
  - `concerts.csv`: opens in Excel
  - `data.js`: the same data, so `index.html` also works by double-click
- `.github/workflows/update.yml` runs the export on the 1st and 15th of each month at 06:00 UTC, commits `data/` (so every version stays in the git history) and publishes the site to GitHub Pages.
- It can also be run by hand: **Actions → Update concerts → Run workflow**.

The API key lives in the repository secret `SETLISTFM_API_KEY`, never in the code.

## Festivals

The setlist.fm API has no festival field. Festivals are listed in `FESTIVAL_EDITIONS` inside `index.html`, one line per edition (name, venue, dates). New editions are only added after checking online; a venue alone never makes a concert a festival.

## Run locally (Windows)

```powershell
$env:SETLISTFM_API_KEY = "your-key"
powershell -ExecutionPolicy Bypass -File .\export.ps1
```

Then double-click `index.html`.
