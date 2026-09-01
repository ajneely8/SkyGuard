# Skyguard

A simple outdoor-safety app for school athletics. It answers four things on one screen:

1. **Where am I** — weather for the exact coordinates of your field, not a city centre.
2. **What is the WBGT** — computed from solar radiation and wind, not heat index.
3. **What do I do about it** — how long you can be outside, what the athletes can wear, how many breaks.
4. **What is coming** — live animated radar, right on the home screen.

```bash
npm install --prefix skyguard
npm run dev --prefix skyguard
```

Open http://localhost:5200 (or use the `skyguard` entry in `.claude/launch.json`).

The app starts empty. First open asks to share your location; if you decline, you can search for a
place instead and everything still works.

---

## Accounts

Sign up with a name, role, email and password; sign in after that. One step, no
email involved — `npm run dev` starts the web server and nothing else.

**Email verification is currently off.** Set `EMAIL_VERIFICATION_ENABLED = true`
in [src/lib/auth.js](src/lib/auth.js) to turn it back on; the code path and the
mail server in [server/index.js](server/index.js) are intact and unchanged. With
it on, run `npm run dev:all` so the mail server starts too, and set
`RESEND_API_KEY` in `.env` to send real email (without a key the server prints
codes to its own terminal and also accepts the fixed `DEV_CODE`, default
`123456`).

**This is device-local authentication either way.** There is no server, so
accounts live in this browser's localStorage. Passwords are never stored in the
clear — each is stretched with PBKDF2-SHA256 (210k iterations, per-account salt)
and only the derived hash is kept — but anything running in this browser can read
that store and nothing verifies against a server. It keeps staff out of each
other's data on a shared sideline tablet; it is not a security boundary. To make
it real, move `createAccount` / `verify` behind an API and issue a server
session token.

## Time zones

Every clock in the app — radar frame times, readings, practice checks — renders in **the field's**
time zone, not the device's. The zone is resolved from the coordinate when a location is saved and
stored on the location record. If the device sits in a different zone, Home says so explicitly and
the radar clock is suffixed with the field's zone (e.g. `PAST · CDT`).

## The four screens

| Screen | What it does |
| --- | --- |
| **Home** | Location, current weather, WBGT, the time/clothing answer, the rest of the day hour by hour, storm status, and the live radar. |
| **Locations** | Your saved fields. Each one has its own GPS coordinates. Switch between them instantly. |
| **Practice** | Start a practice; the app re-checks the WBGT on its own and shows the time limit for the band. |
| **Rules** | The WBGT bands that drive everything — fully editable. |

---

## The rules

`src/lib/guidelines.js` holds the bands. Each one maps a WBGT range to a maximum time outside, a
break pattern, and what equipment is allowed:

| WBGT | Time outside | Equipment |
| --- | --- | --- |
| Below 82.0 °F | No limit | Full pads |
| 82.0 – 86.9 °F | No limit | Full pads, use discretion on conditioning |
| 87.0 – 89.9 °F | 2 hours | Helmet, shoulder pads and shorts only |
| 90.0 – 92.0 °F | 1 hour | No protective equipment, no conditioning |
| 92.1 °F and above | None | Move indoors |

**These are defaults, not gospel.** They are the widely used WBGT activity table, and state
associations publish their own numbers that change over time. Open **Rules** and edit every band —
the range, the time limit, the breaks, the equipment wording — so the app matches the rules your
district is actually held to. Nothing is hard-coded.

The Class 2 / Class 3+ labels are kept as a separate, optional set of thresholds for schools that use
that language.

---

## Where the numbers come from

- **Weather** — [Open-Meteo](https://open-meteo.com), no API key. Read from the 15-minute series, not
  the provider's `current` block, which can lag the clock by an hour.
- **WBGT** — computed from measured temperature, humidity, wind and shortwave solar radiation using
  ISO 7243 (`WBGT = 0.7·Tnwb + 0.2·Tg + 0.1·Tdb`). Solar radiation is what separates this from a
  dressed-up heat index. Every reading records its method.
- **Radar** — [RainViewer](https://www.rainviewer.com/api.html) past and forecast frames, no API key.
  Their free tile cache only holds radar down to **zoom 7**; deeper zooms return a "Zoom Level Not
  Supported" placeholder image rather than a transparent tile. The layer is capped at that zoom
  (`RADAR_MAX_NATIVE_ZOOM` in `src/lib/radar.js`) and Leaflet upscales, so close-in views are softer
  but never show provider error text. A paid RainViewer key raises the cap.
- **Radar scope** — the sweep is cosmetic, but the range rings are real: they are measured through
  Leaflet's projection from the selected field, so a cell crossing the second ring is 10 miles out.
- **Storms** — National Weather Service active alerts. The distance shown is to the nearest **warning
  polygon**, measured, with a compass bearing.
- **Maps** — OpenStreetMap tiles.

### Two honesty rules the code enforces

**Stale data is never shown as current.** Past the staleness window the app says WEATHER DATA
UNAVAILABLE and refuses to display an old number as if it were live.

**No lightning strike detection is bundled.** There is no free public feed of individual strikes.
Commercial networks (Vaisala, Earth Networks) are paid. So the app reports distance to NWS storm
warnings and labels it as such. `src/lib/lightning.js` has a `strikeProvider` interface — implement it
and true strike distances light up everywhere without touching the screens.

---

## What this build is not

No backend. Locations, readings and practices live in `localStorage`, which means no real
authentication, no syncing between phones, and no push/SMS alerts. To productionise, replace
`src/lib/store.jsx` with API calls against the same shape and move the practice monitoring loop to a
server-side scheduler. `guidelines.js`, `wbgt.js` and the screens carry over unchanged.

Device location needs a secure context — it works on `localhost` and over HTTPS. The app detects the
insecure-origin case and says so instead of failing silently.

---

## Disclaimer

Skyguard is a monitoring and decision-support tool. Schools remain responsible for
following the current rules and requirements of their governing body. It is not a lightning
strike-detection service and does not replace official National Weather Service warnings.
