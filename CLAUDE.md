# Aurora Watch

Static northern-lights forecast site for Tromsø, Kiruna and Rovaniemi, served by GitHub Pages from `main` (root). A daily GitHub Actions job refreshes the forecast and emails subscribers through Brevo on Good days. README.md has the owner-facing setup checklist; this file is for working on the code.

## Layout

- `index.html` — the whole site in one file: CSS, the page, and inline JS. Line ~265 holds `CONFIG` (`brevoFormUrl` is still empty, so the signup form shows "opening soon"). Below it are two large embedded data blobs: `GEO` (~395 airports and ~10k cities, used offline to find a visitor's nearest airport) and `FALLBACK` (a forecast snapshot, used if `forecast.json` fails to load). Don't load all of `index.html` at once. Grep for what you need.
- `forecast.json` — the current forecast. The page fetches it with a cache-busting query. The workflow overwrites and commits it every day, so don't hand-edit it.
- `scripts/refresh.py` — builds `forecast.json`. Python standard library only.
- `scripts/send.js` — sends the daily Brevo campaign, or a test email. Node 18+, no dependencies.
- `.github/workflows/daily.yml` — the daily schedule plus a manual "Run workflow" button.

## Forecast rules (refresh.py)

- Nights are D+1, D+2 and D+3, where D is the run date in London. Each night's window is 18:00–03:00 in the city's local time.
- Aurora comes from NOAA SWPC's planetary Kp 3-hour forecast: the highest Kp of any 3-hour block that overlaps the window. That forecast only reaches the end of D+2, so for later nights the script uses the "largest Kp" from NOAA's 27-day outlook and sets `kpSource: "outlook"`. The page and emails mark those values with ≈.
- Clouds come from MET Norway Locationforecast `cloud_area_fraction`, averaged over the window. Data is hourly for about 60 h, then 6-hourly. MET Norway requires an identifying User-Agent, which is set in the script.
- A night is good when Kp ≥ 3 and cloud ≤ 40%. A city is Good when at least 2 of its 3 nights are good. The thresholds live in `KP_MIN` and `CLOUD_MAX`.
- Run it locally: `python3 -I scripts/refresh.py forecast.json`.

## Daily schedule (daily.yml)

- The target is 06:00 London, 1 October to 31 March. GitHub cron is UTC-only and often delays or drops runs, especially on the hour. So the cron fires at `3,33 5,6,7` UTC, and the "Check the time in London" step lets a scheduled run continue only if London time is 06:00–10:00 and `forecast.json`'s `updatedAt` is before 06:00 London today. This handles summer time, retries dropped slots, and keeps emails to at most one per day. Keep this gate if you change the cron.
- Manual runs (`workflow_dispatch`) skip the gate. Input `email`: `test` sends one preview to `test_email`, `list` sends the real alert if a city is Good, `none` updates the forecast only.
- After committing `forecast.json`, the job also asks Pages to rebuild (`pages: write`).
- Secrets and variables: secret `BREVO_API_KEY`; variables `BREVO_LIST_ID`, `SENDER_EMAIL`, `SENDER_NAME`, `SITE_URL`. Without the API key, `send.js` exits 0 and the forecast still updates.

## Email (send.js)

- One Brevo campaign goes to the whole list. Flight links are personalised per subscriber with `{{ contact.ORIGIN }}`, the airport code the signup form stores. Brevo handles unsubscribes and double opt-in.
- The HTML is table-based with inline styles. Set every background as both a `bgcolor` attribute and `background-color`. Some clients strip the CSS backgrounds and keep the light text colours, which made an earlier version unreadable. Don't use the `background:` shorthand or images.

## Flight links

- Skyscanner `https://www.skyscanner.net/transport/flights/{from}/{to}/{yymmdd}/` (lowercase IATA codes), plus Google Flights as a second link. The departure date is the first good night that hasn't passed yet, or tomorrow. Destinations: TOS, KRN, RVN.

## Conventions

- No build step and no runtime dependencies: keep the site a single static file and the scripts dependency-free.
- The workflow commits to `main` as `aurora-watch-bot`. Pull before pushing, because a scheduled run may have just committed `forecast.json`.
- Design: dark polar-night palette with a single oxygen-green accent (`--aurora: #5ee2a8`), the Familjen Grotesk and IBM Plex Mono fonts, and a subtle canvas aurora band that respects `prefers-reduced-motion`. Keep it calm, not kitsch.
