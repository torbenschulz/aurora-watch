"""Aurora Watch refresh: builds the 3-night forecast for Tromsø, Kiruna and Rovaniemi.

Sources (free, no key):
  * NOAA SWPC planetary Kp 3-day forecast  - services.swpc.noaa.gov
    (3-hour blocks; nights beyond it use the 27-day outlook's daily largest Kp)
  * MET Norway Locationforecast (cloud %)  - api.met.no

Usage:  python3 -I refresh.py OUTPUT.json
Writes one JSON document: the forecast the page and the daily email read.
Standard library only.
"""
import json, ssl, sys, os, urllib.request
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo

KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"
OUTLOOK_URL = "https://services.swpc.noaa.gov/text/27-day-outlook.txt"
MET_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={lat}&lon={lon}"
UA = "aurora-watch/1.0 github.com/torbenschulz/aurora-watch"

KP_MIN = 3.0        # strong aurora overhead at ~67-70°N
CLOUD_MAX = 40.0    # mean cloud cover (%) during the dark window
NIGHT_START, NIGHT_END = 18, 3   # local hours: 18:00 -> 03:00 next morning

CITIES = [
    {"id": "tromso",    "name": "Tromsø",    "country": "Norway",  "iata": "TOS", "lat": 69.649, "lon": 18.956, "tz": "Europe/Oslo"},
    {"id": "kiruna",    "name": "Kiruna",    "country": "Sweden",  "iata": "KRN", "lat": 67.856, "lon": 20.225, "tz": "Europe/Stockholm"},
    {"id": "rovaniemi", "name": "Rovaniemi", "country": "Finland", "iata": "RVN", "lat": 66.503, "lon": 25.729, "tz": "Europe/Helsinki"},
]


def fetch(url):
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last = None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # retry transient failures
            last = e
    raise last


def get_json(url):
    return json.loads(fetch(url))


def outlook_kp():
    """{date: largest Kp} from NOAA's 27-day outlook table (lines like '2026 Nov 09  120  15  4')."""
    out = {}
    for line in fetch(OUTLOOK_URL).splitlines():
        parts = line.split()
        if len(parts) == 6 and parts[0].isdigit():
            try:
                d = datetime.strptime(" ".join(parts[:3]), "%Y %b %d").date()
                out[d] = float(parts[5])
            except ValueError:
                pass
    return out


def utc(s):
    t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def main(out_path):
    now = datetime.now(timezone.utc)
    kp_rows = get_json(KP_URL)
    kp_slots = [(utc(r["time_tag"]), float(r["kp"]), r["observed"]) for r in kp_rows if r.get("kp") is not None]
    kp_last_end = max(t for (t, _, _) in kp_slots) + timedelta(hours=3)
    outlook = outlook_kp()

    # The three nights are D+1, D+2 and D+3, where D is the run date in London.
    today = now.astimezone(ZoneInfo("Europe/London")).date()
    nights = [today + timedelta(days=i) for i in range(1, 4)]

    result = {
        "updatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "thresholds": {"kp": KP_MIN, "cloud": CLOUD_MAX, "window": f"{NIGHT_START:02d}:00–{NIGHT_END:02d}:00 local"},
        "sources": {"aurora": "NOAA SWPC planetary Kp forecast (3-hour), 27-day outlook beyond it",
                    "clouds": "MET Norway Locationforecast"},
        "nights": [d.isoformat() for d in nights],
        "cities": [],
    }

    for c in CITIES:
        tz = ZoneInfo(c["tz"])
        met = get_json(MET_URL.format(lat=c["lat"], lon=c["lon"]))
        cloud_pts = [(utc(t["time"]), t["data"]["instant"]["details"].get("cloud_area_fraction"))
                     for t in met["properties"]["timeseries"]]
        rows, good_count = [], 0
        for d in nights:
            start = datetime(d.year, d.month, d.day, NIGHT_START, tzinfo=tz)
            nd = d + timedelta(days=1)
            end = datetime(nd.year, nd.month, nd.day, NIGHT_END, tzinfo=tz)
            # Kp: 3-hour slots overlapping the dark window; if the 3-hour forecast stops
            # before the window ends, fall back to the outlook's daily largest Kp.
            kps = [k for (t, k, _) in kp_slots if t < end and t + timedelta(hours=3) > start]
            kp_src = "3h"
            if kp_last_end < end:
                daily = [outlook[x] for x in (d, nd) if x in outlook]
                kps += daily[:1] if daily else []
                kp_src = "outlook"
            clouds = [v for (t, v) in cloud_pts if start <= t <= end and v is not None]
            kp_max = round(max(kps), 2) if kps else None
            cloud_mean = round(sum(clouds) / len(clouds)) if clouds else None
            good = kp_max is not None and cloud_mean is not None and kp_max >= KP_MIN and cloud_mean <= CLOUD_MAX
            good_count += good
            rows.append({"date": d.isoformat(), "kp": kp_max, "kpSource": kp_src, "cloud": cloud_mean, "good": good,
                         "hasData": kp_max is not None and cloud_mean is not None})
        result["cities"].append({k: c[k] for k in ("id", "name", "country", "iata")} |
                                {"nights": rows, "goodNights": good_count,
                                 "verdict": "good" if good_count >= 2 else "bad"})

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(json.dumps({c["name"]: [c["verdict"], [(n["kp"], n["cloud"]) for n in c["nights"]]] for c in result["cities"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "forecast.json")
