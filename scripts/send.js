// Aurora Watch: emails the daily alert to the Brevo list on Good days.
//
// Usage: node scripts/send.js forecast.json
//
// Environment (set in GitHub → Settings → Secrets and variables → Actions):
//   BREVO_API_KEY   secret   Brevo API key (SMTP & API → API keys)
//   BREVO_LIST_ID   variable numeric ID of the Brevo list the signup form adds people to
//   SENDER_EMAIL    variable sender address on your own domain, verified in Brevo (e.g. alerts@yourdomain.com)
//   SENDER_NAME     variable defaults to "Aurora Watch"
//   SITE_URL        variable public address of the page, e.g. https://yourdomain.com
//   MODE            auto  = send to the whole list, only if a city is Good (the daily schedule)
//                   test  = send one preview to TEST_EMAIL, even on a Bad day
//                   skip  = do nothing
//   TEST_EMAIL      address for MODE=test
//
// Each subscriber's flight links use their own starting airport through the
// Brevo contact attribute ORIGIN, so one campaign covers everyone.
// Pure Node 18+: no dependencies.
const fs = require("fs");

const env = process.env;
const MODE = (env.MODE || "auto").trim();
const SITE = (env.SITE_URL || "").replace(/\/+$/, "") || "https://aurora.tbsz.io";
const ORIGIN = "{{ contact.ORIGIN }}";

if (MODE === "skip") { console.log("Email step skipped."); process.exit(0); }
if (!env.BREVO_API_KEY) { console.log("No BREVO_API_KEY secret yet, so no emails. The forecast was still updated."); process.exit(0); }
for (const k of ["BREVO_LIST_ID", "SENDER_EMAIL"]) {
  if (!env[k]) { console.error(`Missing repository variable ${k}.`); process.exit(1); }
}
if (MODE === "test" && !env.TEST_EMAIL) { console.error("MODE=test needs a test email address."); process.exit(1); }

const fc = JSON.parse(fs.readFileSync(process.argv[2] || "forecast.json", "utf8"));
const goodCities = fc.cities.filter((c) => c.verdict === "good");
if (!goodCities.length && MODE === "auto") { console.log("No city is Good today. No email sent."); process.exit(0); }

/* ---------- email HTML (tables + inline styles, so it renders in every mail client) ---------- */
const th = fc.thresholds || { kp: 3, cloud: 40 };
const C = { sky: "#0a1018", card: "#111a26", line: "#233142", ink: "#e6edf3", ink2: "#93a3b5", ink3: "#64758a",
            aurora: "#5ee2a8", auroraDim: "#2c6d55", bad: "#e58d7b", badLine: "#7a4a40", track: "#1d2a3a",
            kpBar: "#7fd9b9", cloudBar: "#8796ab" };
const FONT = "Helvetica,Arial,sans-serif", MONO = "'SFMono-Regular',Menlo,Consolas,monospace";
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const today = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtNight = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const kpText = (n) => n.kp == null ? "–" : (n.kpSource === "outlook" ? "≈" : "") + n.kp.toFixed(1);

function links(city) {
  const good = city.nights.filter((n) => n.good).map((n) => n.date).filter((d) => d >= today);
  const date = good[0] || addDays(today, 1);
  return {
    date,
    sky: `https://www.skyscanner.net/transport/flights/${ORIGIN}/${city.iata.toLowerCase()}/${date.slice(2).replace(/-/g, "")}/`,
    google: `https://www.google.com/travel/flights?q=One%20way%20flights%20from%20${ORIGIN}%20to%20${city.iata}%20on%20${date}`,
  };
}

function summary(c) {
  const clear = c.nights.filter((n) => n.cloud != null && n.cloud <= th.cloud).length;
  const active = c.nights.filter((n) => n.kp != null && n.kp >= th.kp).length;
  if (c.verdict === "good") return `${c.goodNights} of 3 nights look active and clear.`;
  if (active >= 2 && clear < 2) return "Aurora activity is there, but clouds cover most nights.";
  if (clear >= 2 && active < 2) return "Skies look clear, but aurora activity is forecast to be low.";
  return c.goodNights === 1 ? "Only 1 of 3 nights looks active and clear." : "No night looks both active and clear.";
}

function bar(value, max, color) {
  const pct = value == null ? 0 : Math.max(2, Math.min(100, Math.round((value / max) * 100)));
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="60" style="width:60px;border-collapse:collapse;"><tr>`
    + (pct > 0 ? `<td width="${pct}%" height="4" bgcolor="${color}" style="height:4px;line-height:4px;font-size:0;background-color:${color};">&nbsp;</td>` : "")
    + (pct < 100 ? `<td height="4" bgcolor="${C.track}" style="height:4px;line-height:4px;font-size:0;background-color:${C.track};">&nbsp;</td>` : "")
    + `</tr></table>`;
}

function card(c) {
  const good = c.verdict === "good";
  const badge = good
    ? `<table role="presentation" align="right" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.aurora}" style="padding:6px 10px;border-radius:999px;background-color:${C.aurora};color:${C.sky};font:bold 11px ${MONO};letter-spacing:1px;">GOOD</td></tr></table>`
    : `<table role="presentation" align="right" cellpadding="0" cellspacing="0"><tr><td bgcolor="${C.card}" style="padding:5px 9px;border-radius:999px;border:1px solid ${C.badLine};background-color:${C.card};color:${C.bad};font:bold 11px ${MONO};letter-spacing:1px;">BAD</td></tr></table>`;
  const th1 = `padding:0 0 6px;font:11px ${MONO};letter-spacing:1px;color:${C.ink3};text-align:left;font-weight:normal;`;
  let rows = "";
  for (const n of c.nights) {
    const kpPass = n.kp != null && n.kp >= th.kp, clPass = n.cloud != null && n.cloud <= th.cloud;
    const td = `padding:8px 0;border-top:1px solid ${C.line};vertical-align:middle;`;
    rows += `<tr>
      <td style="${td}font:13px ${FONT};color:${C.ink2};white-space:nowrap;">${esc(fmtNight(n.date))}</td>
      <td style="${td}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;font:12px ${MONO};color:${kpPass ? C.ink : C.ink3};">${esc(kpText(n))}</td><td>${bar(n.kp, 9, C.kpBar)}</td></tr></table></td>
      <td style="${td}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:44px;font:12px ${MONO};color:${clPass ? C.ink : C.ink3};">${n.cloud == null ? "–" : n.cloud + "%"}</td><td>${bar(n.cloud, 100, C.cloudBar)}</td></tr></table></td>
      <td style="${td}text-align:right;font:bold 13px ${FONT};color:${n.good ? C.aurora : C.bad};">${n.good ? "✓" : "×"}</td>
    </tr>`;
  }
  const L = links(c);
  // Flight links only for subscribers who gave a starting airport.
  const fly = `{% if contact.ORIGIN %}<tr><td colspan="2" style="padding-top:14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="${good ? C.aurora : C.card}" style="border-radius:8px;background-color:${good ? C.aurora : C.card};${good ? "" : "border:1px solid #33465c;"}">
        <a href="${L.sky}" style="display:block;padding:12px 14px;font:bold 14px ${FONT};text-decoration:none;color:${good ? C.sky : C.ink};">Flights ${ORIGIN} → ${esc(c.iata)} ↗</a>
      </td></tr></table>
      <div style="padding-top:8px;text-align:center;font:12px ${FONT};color:${C.ink3};">Departing ${esc(fmtNight(L.date))} · Skyscanner · or <a href="${L.google}" style="color:${C.ink2};">Google Flights</a></div>
    </td></tr>{% endif %}`;
  return `<tr><td style="padding:0 0 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${good ? C.auroraDim : C.line};border-radius:12px;">
  <tr><td style="padding:18px 18px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">
          <div style="font:bold 21px ${FONT};color:${C.ink};">${esc(c.name)}</div>
          <div style="font:12px ${FONT};color:${C.ink3};padding-top:3px;">${esc(c.country)} · ${esc(c.iata)}</div>
        </td>
        <td style="vertical-align:top;text-align:right;">${badge}</td>
      </tr>
      <tr><td colspan="2" style="padding:12px 0 12px;font:14px ${FONT};color:${C.ink2};">${esc(summary(c))}</td></tr>
      <tr><td colspan="2">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><th style="${th1}">NIGHT</th><th style="${th1}">KP</th><th style="${th1}">CLOUD</th><th style="${th1}"></th></tr>
          ${rows}
        </table>
      </td></tr>
      ${fly}
    </table>
  </td></tr></table>
</td></tr>`;
}

const names = goodCities.map((c) => c.name);
const verb = names.length > 1 ? "look" : "looks";
const headline = names.length ? `${names.join(" & ")} ${verb} good` : "No city looks good today";
const subject = (MODE === "test" ? "[Test] " : "") + (names.length
  ? `Aurora Watch: ${names.join(" & ")} ${verb} good for northern lights`
  : "Aurora Watch: no good nights in the forecast");
const updated = new Date(fc.updatedAt).toUTCString().replace(" GMT", " UTC");
const hasOutlook = fc.cities.some((c) => c.nights.some((n) => n.kpSource === "outlook"));
const ordered = [...goodCities, ...fc.cities.filter((c) => c.verdict !== "good")];

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background-color:${C.sky};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.sky}" style="background-color:${C.sky};"><tr><td bgcolor="${C.sky}" style="background-color:${C.sky};padding:24px 12px;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.sky}" style="max-width:560px;margin:0 auto;background-color:${C.sky};">
<tr><td style="padding:4px 4px 18px;">
  <div style="font:11px ${MONO};letter-spacing:2px;color:${C.aurora};">AURORA WATCH · 69°N</div>
  <div style="font:bold 26px ${FONT};color:${C.ink};padding-top:8px;">${esc(headline)}</div>
  <div style="font:14px/1.5 ${FONT};color:${C.ink2};padding-top:6px;">Strong aurora (Kp ${th.kp}+) and clear skies (≤${th.cloud}% cloud) on at least 2 of the next 3 nights.{% if contact.ORIGIN %} Flight links start from ${ORIGIN}.{% endif %}</div>
  <div style="font:12px ${MONO};color:${C.ink3};padding-top:10px;">Nights of ${esc(fmtNight(fc.nights[0]))} – ${esc(fmtNight(fc.nights[fc.nights.length - 1]))}${hasOutlook ? " · ≈ from NOAA's 27-day outlook" : ""}</div>
</td></tr>
${ordered.map(card).join("\n")}
<tr><td style="padding:8px 4px 0;font:12px/1.6 ${FONT};color:${C.ink3};">
  Forecast updated ${esc(updated)}. Sources: NOAA SWPC Kp forecast, MET Norway cloud forecast.
  <a href="${esc(SITE)}" style="color:${C.ink2};">Open Aurora Watch</a><br><br>
  You get this because you subscribed on ${esc(SITE.replace(/^https?:\/\//, ""))}. <a href="{{ unsubscribe }}" style="color:${C.ink2};">Unsubscribe</a>
</td></tr></table></td></tr></table>
</body></html>`;

/* ---------- Brevo ---------- */
async function brevo(path, body) {
  const r = await fetch("https://api.brevo.com/v3" + path, {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Brevo ${path} → HTTP ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  const camp = await brevo("/emailCampaigns", {
    name: `Aurora Watch ${today}${MODE === "test" ? " (test)" : ""}`,
    subject,
    sender: { name: env.SENDER_NAME || "Aurora Watch", email: env.SENDER_EMAIL },
    replyTo: env.SENDER_EMAIL,
    htmlContent: html,
    recipients: { listIds: [Number(env.BREVO_LIST_ID)] },
  });
  if (MODE === "test") {
    await brevo(`/emailCampaigns/${camp.id}/sendTest`, { emailTo: [env.TEST_EMAIL] });
    console.log(`Test email sent to ${env.TEST_EMAIL} (campaign ${camp.id}, not sent to the list).`);
  } else {
    await brevo(`/emailCampaigns/${camp.id}/sendNow`, {});
    console.log(`Alert sent to list ${env.BREVO_LIST_ID}: ${names.join(", ")} (campaign ${camp.id}).`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
