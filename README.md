# Aurora Watch

Northern lights forecast for Tromsø, Kiruna and Rovaniemi over the next three nights, with flight links from your nearest airport and an email alert on good days.

## How it works

| Part | Where it lives |
|---|---|
| The page | `index.html`, served by GitHub Pages |
| Daily forecast | `.github/workflows/daily.yml` runs `scripts/refresh.py` every morning, 1 October to 31 March, and commits `forecast.json`. The page reads that file. |
| Subscribers | A Brevo contact list. The page's form posts to a Brevo signup form (double opt-in), storing the email and the `ORIGIN` airport code. |
| Alert emails | `scripts/send.js` sends one Brevo campaign to the list when at least one city is Good. Flight links are personalised per subscriber with `{{ contact.ORIGIN }}`. Brevo handles unsubscribes. |

A city is **Good** when at least two of the next three nights have Kp ≥ 3 (NOAA SWPC) and ≤ 40 % average cloud cover (MET Norway) between 18:00 and 03:00 local time.

## Setup checklist

1. **GitHub Pages:** Settings → Pages → Deploy from a branch → `main` / root.
2. **Brevo**
   - Contacts → Settings → Contact attributes: add a text attribute `ORIGIN`.
   - Contacts → Lists: create a list, note its numeric ID.
   - Contacts → Forms: create a signup form with fields Email and ORIGIN, adding people to that list, with double opt-in. Copy the form's `action` URL from its HTML embed code into `CONFIG.brevoFormUrl` near the top of the script in `index.html`.
   - Senders, domains & dedicated IPs: authenticate your domain (DNS records) and add the sender address.
   - SMTP & API → API keys: create a key.
3. **GitHub Actions settings** (Settings → Secrets and variables → Actions)
   - Secret `BREVO_API_KEY`
   - Variables `BREVO_LIST_ID`, `SENDER_EMAIL`, `SENDER_NAME` (optional), `SITE_URL`
4. **Test:** Actions → Daily forecast and alerts → Run workflow → email `test`, with your address.

## Run by hand

```
python3 scripts/refresh.py forecast.json
MODE=test TEST_EMAIL=you@example.com BREVO_API_KEY=… BREVO_LIST_ID=… SENDER_EMAIL=… node scripts/send.js forecast.json
```
