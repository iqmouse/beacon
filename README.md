# Beacon 🔆

*Find the city that feels like you — and the work and home waiting there.*

Beacon is a breezy, fully **deterministic** city-matching app. Twenty-six unhurried
questions become a profile across thirteen dimensions, and a transparent formula —
no AI, no API keys, no costs — matches you against **173 researched cities** on six
continents. Same answers, same result, every time.

## What it does

- **The questionnaire** — 26 questions in a warm, cursive-lettered flow: how fast
  life should move, what should be outside your window, which languages you could
  live in, what makes a rougher edge worth it *to you*.
- **The reveal** — a full-screen cinematic moment: your city's name glowing over
  its generatively illustrated skyline, with a pentatonic bell cascade.
- **Matching** — top three overall, plus your top three on every continent.
  Every city gets an honest percentage; ties are real ties.
- **Compare** — any two cities side by side across all dimensions, amber marking
  whichever sits closer to your answers, with researched facts beneath.
- **Jobs & homes** — deterministic sample listings per city: roles drawn from the
  city's industries with pay scaled to its cost-of-living index, and homes priced
  from its market rent, with deep links into the real local market (Zillow,
  Idealista, Funda, Zoopla…).
- **The lantern** — save jobs and homes into a slide-out drawer, grouped by city.
- **Profiles** — named profiles keep your lantern and matches; persisted via the
  claude.ai artifact runtime when hosted there, falling back to `localStorage`
  everywhere else.
- **A generative score** — ambient music composed in WebAudio: a drifting chord
  pad and pentatonic bells through a long echo, with UI sounds in the same key.
- **Shareable card** — a canvas-rendered dusk card of your result.

## How the matching works

No model, no black box. Each city carries researched data; each dimension's fit is
`1 − |you − city| / 10`, weighted. Four dimensions bend to your situation instead
of measuring distance:

| Dimension | Rule |
|---|---|
| **Language** | Capability, not preference: shared language = full credit, English-friendliness = partial, willingness-to-learn carries the rest |
| **Cost** | One-way: cheaper than your comfort is never penalized; pricier is only forgiven when it buys the quality *you* named |
| **Safety** | A floor you set, softened by the tradeoff you chose (culture, cost, or nature) |
| **Diversity** | Counts exactly as much as you said it does |

The weighted mean is raised to a power to spread the field; that's the percentage.
The full explanation lives in the app under **"how the light works."**

## Data provenance

- **Rents** — Numbeo, 1-bed city centre (2026)
- **Cost of living** — Numbeo Cost of Living Plus Rent Index
- **Safety** — Numbeo Safety Index (~20 gaps filled with country-informed estimates)
- **Sunshine** — Wikipedia climate-normal tables
- **Diversity** — authored 0–10 judgments (no credible single global index exists)
- **City personalities, voice lines, neighborhoods** — hand-authored

## Running it

It's one file. No build, no dependencies, no keys.

```bash
open index.html          # or serve it:
python3 -m http.server 4173
```

The only external resource is Google Fonts (free, keyless); the app falls back to
system fonts offline.

## Roadmap

- Split the single file into modules (data / scoring / audio / skylines / views)
- Real authentication for profiles
- Live job & housing feeds behind a small server (keys stay server-side)
- A test suite around the scorer

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
