# Long Road

Personal concert archive of João Miguel (setlist.fm user `ojoaomiguel`). UI texts are in English. Talk to João in European Portuguese.

## Festival review (after each export)

The setlist.fm API has no festival field. Festivals live in `FESTIVAL_EDITIONS` in `index.html`.

1. `git pull`, then run `node tools/festival-check.js`. It prints the concerts that are not in any festival edition and were not reviewed yet, grouped by date + venue. If it prints `[]`, stop: nothing to do.
2. For each group, search the web to find out whether that date at that venue was part of a festival. Look for the festival's own site, the line-up, news and setlist.fm's festival pages.
   - NEVER decide from the venue alone. Venues like Coliseu, Alfândega or Serralves host normal concerts too.
   - Only add an edition when a source confirms the festival and its dates. When in doubt, leave it as a normal concert and say so in the PR.
   - Use the festival name as setlist.fm writes it (e.g. "NOS Alive", "Primavera Sound Porto", "MEO Marés").
3. Add one line per edition at the end of `FESTIVAL_EDITIONS`:
   `{ name: "Festival", venue: "Exact venue name from the data", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }`
   `venue` can be an array when the festival uses several stage names.
   - setlist.fm often lists a stage ("Palco Heineken", "Orange") or a region as the venue. In that case also add `site: "Real festival ground"` (e.g. "Passeio Marítimo de Algés", "Iberdrola Music"), confirmed on the web like the dates. The app then shows the site as the venue and the stage only as a detail. Never show a stage name as a venue. Add `pad: 0` when the venue also hosts normal concerts (halls, clubs); leave it out for festival grounds (default ±2 days).
4. Run `node tools/festival-check.js --mark-all` so every checked concert goes into `tools/reviewed-ids.txt`.
5. If you added editions: create a branch `festivals/YYYY-MM-DD`, commit, push and open a PR to `main`. In the description, list each new edition with its source link and each concert you left as normal with a short reason. Tell João in the project thread; merge only after he approves there in writing.
   If you added nothing: commit only `tools/reviewed-ids.txt` straight to `main` and push.

## Other rules

- `data/` is written only by the GitHub Action (`.github/workflows/update.yml`). Do not edit it by hand.
- The API key is the repo secret `SETLISTFM_API_KEY`. Never write it anywhere.
- Venues with several names (renamed venues, rooms of the same building) are merged in `VENUE_ALIASES` in `index.html`. Only add entries João confirms.
- Upcoming shows live in `upcoming.js`. The setlist.fm API does not return them and the attendance page blocks automated downloads (HTTP 202 challenge), so do not scrape it from the Action. During each festival review, read https://www.setlist.fm/attended/ojoaomiguel?page=1 with WebFetch ("Upcoming Shows" list; WebFetch caches a URL for 15 minutes, so vary the query string if João just added a show) and update `upcoming.js` (date, artist, place, url; sorted by date; drop past shows).
- Milestones are frozen in `FIXED_MILESTONES` in `index.html` (setlist id per mark; only total concerts, João dropped the new-artist marks). When a review finds a new mark reached (1250, 1500…), add its id there with the value the app shows, and tell João. When newly added older concerts shift the positions, recompute every mark to follow the data (João, 2026-10-23: "fiéis aos dados"); on a day with several concerts pick the headliner. Tell João what changed.
