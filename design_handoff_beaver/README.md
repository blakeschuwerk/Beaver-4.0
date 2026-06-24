# Handoff: Beaver 4.0 — Frontend + Backend Spec

## Overview
Beaver is a B2B SaaS tool for civil contractors, estimators, and suppliers. It scrapes public infrastructure procurement documents (county board minutes, FDOT notices, etc.), extracts structured project data via an AI pipeline, scores each project against a contractor's profile, and surfaces ranked leads with stage-change alerts.

This package contains a **high-fidelity HTML prototype** (`Beaver.dc.html`) built as a design reference. The task is to **recreate these designs in your production codebase** (React + your chosen backend stack) — not to ship the HTML directly. The prototype contains realistic mock data and all interactions are wired, so it fully represents intended behavior.

---

## Fidelity
**High-fidelity.** Pixel-accurate colors, typography, spacing, component states, hover effects, and transitions are all final. Implement them exactly. The only things that are mocked: data (replace with real API calls), the AI pipeline trace (replace with real pipeline output), and the county Add flow (needs a real settings persistence layer).

---

## Screens & Views

### 1. Auth / Sign-Up (`screen: 'auth'`)
**Purpose:** New user registration. Collects email, password, company name, service categories, and geography coverage.

**Layout:**
- Full-viewport split: left panel `flex: 0 0 42%`, right panel `flex: 1`
- Left: accent-color background, Beaver logo top-left, marketing copy center-left, version footer bottom-left. Overflow hidden with decorative background shapes.
- Right: centered card `max-width: 420px`, vertically centered in the panel, `padding: 48px`, scrollable on overflow.

**Left panel content:**
- Logo: 36×36px rounded square (border-radius 10px), `background: rgba(255,255,255,0.16)`, two 5×13px white bars inside (the "beaver" icon)
- Headline: `font-size: 34px, font-weight: 700, line-height: 1.15, letter-spacing: -0.02em`, white
- Three bullet points with 6px dot markers at `rgba(255,255,255,0.85)`
- Footer: `font-size: 12.5px, color: rgba(255,255,255,0.6)`

**Right panel form:**
- Title: `font-size: 24px, font-weight: 700`
- SSO button: full width, `height: 44px`, white bg, `border: 1px solid #e2e5e9`, `border-radius: 10px`, hover: `background: #fafbfc`
- "or" divider: `height: 1px, background: #e6e8eb`
- Inputs: `height: 42px`, `border: 1px solid #e2e5e9`, `border-radius: 9px`, `font-size: 14px`, focus ring: `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-weak)`
- Labels: `font-size: 12.5px, font-weight: 600, color: #374151`
- **Service categories:** flex-wrap toggle chips. Selected: `background: var(--accent), color: #fff`. Unselected: `background: #f3f4f6, color: #374151`. Both: `height: 32px, padding: 0 14px, border-radius: 8px, border: none, font-size: 13px, font-weight: 500`
- Categories available: Roadway, Drainage, Earthwork, Concrete, Structural, HVAC, Mechanical, Electrical, Striping
- **Geography chips:** same style as categories. Counties: Orange County, Seminole County, Volusia County, Osceola County, Lake County
- Submit CTA: full width, `height: 46px`, `background: var(--accent)`, white text, `border-radius: 10px`, `font-size: 14.5px, font-weight: 600`

---

### 2. App Shell (persistent across screens 2–8)
**Layout:** `display: flex, min-height: 100vh`

**Sidebar** (`flex: 0 0 244px`):
- `background: #fff`, `border-right: 1px solid #e9ebee`, sticky, full viewport height
- Logo area: `padding: 22px 20px 16px`; logo mark is 32×32px `border-radius: 9px`, accent bg, same two-bar icon
- Nav: `padding: 8px 12px`, `gap: 2px` between items
- Nav item (inactive): `height: 38px, padding: 0 12px, border-radius: 9px, background: transparent, color: #6b7280, font-size: 13.5px, font-weight: 500, display: flex, align-items: center, gap: 9px`
- Nav item (active): same but `background: var(--accent-weak), color: var(--accent), font-weight: 600`
- Tracked count badge: `font-size: 11px, font-weight: 600, padding: 1px 7px, border-radius: 20px`, active: accent colors, inactive: `background: #eef0f2, color: #6b7280`
- Updates dot: `width: 7px, height: 7px, border-radius: 50%, background: var(--accent)` (shown when there are unread updates), `margin-left: auto`
- Admin section: visible only to admin role. Divider `height: 1px, background: #eef0f2, margin: 10px 8px`. Section label: `font-size: 10.5px, font-weight: 600, letter-spacing: 0.08em, text-transform: uppercase, color: #a8b0ba`
- **Role switcher** (bottom of sidebar): pill toggle, `background: #f1f3f5, border-radius: 9px, padding: 3px`, buttons `flex: 1, height: 30px, border-radius: 7px`. Active: `background: #fff, box-shadow: 0 1px 3px rgba(0,0,0,0.08), font-weight: 600`
- Account row: 32px avatar circle, `background: var(--accent-weak), color: var(--accent)`, initials, name `font-size: 13px, font-weight: 600`, company `font-size: 11.5px, color: #9aa3af`

**Top header** (sticky, `z-index: 5`):
- `padding: 22px var(--pad) 18px`, `border-bottom: 1px solid #eceef0`
- `background: rgba(246,247,248,0.85)`, `backdrop-filter: blur(6px)`
- Page title: `font-size: 21px, font-weight: 700, letter-spacing: -0.015em`
- Page subtitle: `font-size: 13.5px, color: #7a828d`

**Main content area:** `flex: 1, padding: var(--pad), max-width: 1180px`

---

### 3. Dashboard (`screen: 'dashboard'`)
**Purpose:** Quick summary of top matched projects + tracked project stage changes.

**New Matches section:**
- Section header row: label `font-size: 16px, font-weight: 700` + count `font-size: 13px, color: #9aa3af` + "View all →" link right-aligned, `color: var(--accent), font-weight: 600`
- Grid: `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`, `gap: var(--cardgap)`
- Shows top 6 projects sorted by match score descending
- Each card: see **Project Card** component below

**Tracked Project Updates section:**
- Section header: same style + "N changed" count
- List: `display: flex, flex-direction: column, gap: 10px`
- Each update row: white card, `border-radius: 13px`, `padding: 16px var(--cardpad)`, `display: flex, align-items: center, gap: 14px`
- Left dot: `width: 8px, height: 8px, border-radius: 50%, background: var(--accent), box-shadow: 0 0 0 4px var(--accent-weak)`
- Content: project name `font-weight: 600, font-size: 14.5px`; below it the **Stage Change Graphic** (see component below)
- Right: relative timestamp `font-size: 12px, color: #a8b0ba`, IBM Plex Mono
- Hover: `box-shadow: 0 4px 14px rgba(15,23,42,0.06), border-color: #dadee2`

---

### 4. Lead Feed (`screen: 'feed'`)
**Purpose:** Full filterable list of all matched projects.

**Filter bar** (white card, `border-radius: 13px, padding: 16px, margin-bottom: 18px`):

Row 1 (`display: flex, gap: 12px, align-items: center, flex-wrap: wrap`):
- **Search input:** `flex: 1, min-width: 220px`, `height: 40px`, left-padded `34px` for search icon at `left: 12px`. Focus: accent border + 3px accent-weak shadow.
- **County dropdown** (custom — NOT a native `<select>`): `min-width: 148px`, trigger button `height: 40px, padding: 0 34px 0 12px, border-radius: 9px`. Chevron icon absolutely positioned at right. Dropdown panel: `position: absolute, top: 46px, min-width: 210px, border-radius: 11px, box-shadow: 0 8px 28px rgba(15,23,42,.11), z-index: 200`. Panel contains:
  1. "All counties" row with checkmark (visible when selected), accent-colored text when active
  2. Divider `height: 1px, background: #f0f2f4`
  3. **"+ Add county" row** — accent color, plus icon SVG, `font-size: 13px, font-weight: 500`. Clicking reveals inline input + "Add" button (`height: 32px, border-radius: 7px`). Submitting adds the county to the list AND selects it as the active filter. Persists in user's county list.
  4. Divider
  5. County list items — each with hidden/visible checkmark column for alignment
  - Close on click-outside (mousedown listener)
- **All trades select:** native `<select>`, same height/style as county trigger

Row 2 (`display: flex, gap: 14px, align-items: center, flex-wrap: wrap, justify-content: space-between`):
- **Stage chips:** pill buttons. Active: `background: var(--accent), color: #fff, font-weight: 600`. Inactive: `background: #fff, border: 1px solid #e6e8eb, color: #6b7280`. All: `height: 32px, padding: 0 14px, border-radius: 20px, font-size: 13px`. Chips: All, Early Planning, Approved, Out for Bid, Awarded, Closed.
- **Min match slider:** `width: 120px`, `accent-color: var(--accent)`. Range 0–95 step 5. Value shown in IBM Plex Mono, accent color, `min-width: 34px`.

**Results count:** `font-size: 13px, color: #9aa3af, margin-bottom: 12px`

**Project grid:** same grid spec as Dashboard, renders filtered+searched results. Empty state: centered, `padding: 64px 20px`.

---

### 5. Project Details (`screen: 'details'`)
**Purpose:** Full detail view of a single project. Accessed by clicking any project card anywhere.

**Back button:** `color: #7a828d, font-size: 13px, font-weight: 500`, left-arrow SVG, `margin-bottom: 18px`, hover: `color: #16191d`

**Header:**
- Stage badge + match badge row
- Project name: `font-size: 26px, font-weight: 700, letter-spacing: -0.02em, line-height: 1.2`
- Agency + location: `font-size: 14px, color: #7a828d`
- Track button (right): `height: 40px, padding: 0 16px, border-radius: 9px`. When tracked: accent bg, white text, filled bookmark icon. When not: white bg, border `#e2e5e9`, dark text.

**Pipeline stage tracker** (white card, `border-radius: 13px, padding: 22px var(--cardpad), margin-top: 22px`):
- Section label: `font-size: 12px, font-weight: 600, letter-spacing: 0.05em, text-transform: uppercase, color: #a8b0ba`
- 5 steps in a row: Early Planning → Approved → Out for Bid → Awarded → Closed
- Each step: circle `width: 32px, height: 32px, border-radius: 50%`. Completed: `background: var(--accent), color: #fff`. Current: `background: var(--accent), color: #fff, box-shadow: 0 0 0 4px var(--accent-weak)`. Future: `background: #eef0f2, color: #a8b0ba`.
- Step label: `font-size: 11px, text-align: center, margin-top: 7px, max-width: 72px`. Active: `color: var(--accent), font-weight: 600`. Past: `color: #6b7280`. Future: `color: #a8b0ba`.
- Connectors between circles: `height: 2px, flex: 1`. Completed connector: `background: var(--accent)`. Future: `background: #eef0f2`.

**Two-column content** (`grid-template-columns: 1.5fr 1fr, gap: 18px, margin-top: 18px`):

Left column:
1. **Requirements card:** white, `border-radius: 13px`. Section label (same uppercase style). Body: `font-size: 14px, line-height: 1.6, color: #374151`.
2. **"Why this matched you" card:** `background: var(--accent-weak), border: 1px solid var(--accent-weak), border-radius: 13px`. Star icon + "WHY THIS MATCHED YOU" label in accent. Body text `color: #2a3f3c`.
3. **Niche tags card:** white, displays tags as pills `font-size: 12.5px, background: #f3f4f6, color: #374151, padding: 5px 11px, border-radius: 7px, font-weight: 500`.

Right column:
- **Metadata table:** white card, rows for: Budget, Stage, Deadline, County, Tracking #, Type. Each row: `padding: 13px 0, border-bottom: 1px solid #f0f2f4`. Label `font-size: 12.5px, color: #9aa3af`. Value right-aligned, `font-size: 13.5px, font-weight: 500`. Budget uses IBM Plex Mono. Stage value uses stage badge.

---

### 6. Tracked Projects (`screen: 'tracked'`)
**Purpose:** Grid of all bookmarked projects, with "Changed" indicator for stage-updated ones.

- Same project card grid layout as feed
- Cards with `changed: true` show a "Changed" pill badge in top-right of card: `font-size: 10.5px, font-weight: 600, color: var(--accent), background: var(--accent-weak), padding: 3px 8px, border-radius: 20px`. Includes 5px accent dot.
- Empty state: centered icon, heading, subtext, "Browse Lead Feed" CTA button

---

### 7. Project Updates (`screen: 'updates'`)
**Purpose:** Timeline of stage-change events on tracked projects.

- `max-width: 760px`
- Timeline: `padding-left: 6px`. Each item is a flex row with a timeline track on the left (11px dot + 2px connector line) and a card on the right.
- Dot: `width: 11px, height: 11px, border-radius: 50%, background: var(--accent), box-shadow: 0 0 0 4px var(--accent-weak), margin-top: 20px`
- Connector: `width: 2px, flex: 1, background: #eef0f2, min-height: 8px`
- Card: white, `border-radius: 13px`, `padding: 15px var(--cardpad)`. Name + timestamp row. Below: from-stage badge → arrow SVG → to-stage badge.
- Arrow SVG: `stroke: #c2c8ce, stroke-width: 2`
- Empty state: centered text

---

### 8. Admin: Testing Console (`screen: 'adminInput'`)
**Purpose:** Admin tool to test the AI pipeline against a document URL or uploaded PDF, scored against the test user profile.

- `max-width: 680px`
- Sandbox warning banner: `background: #fdf6e8, border: 1px solid #f3e3b8, border-radius: 11px`, amber warning icon, `font-size: 13px, color: #8a6a18`
- White card `border-radius: 13px, padding: 24px`:
  - Document source label + URL input (full-width, same input style)
  - "or" divider
  - Drag/drop upload zone: `border: 1.5px dashed #d7dbe0, border-radius: 11px, padding: 26px, text-align: center`. Hover: `border-color: var(--accent), background: var(--accent-weak)`. Upload icon SVG + "Upload a sample PDF" text + "PDF up to 25 MB" subtext.
  - Horizontal rule `height: 1px, background: #eef0f2, margin: 24px 0`
  - Test user profile section: shows `onbCats` as accent-colored chips, `onbGeos` as gray chips
  - "Run Test" CTA: full-width, accent bg, play icon + "Run Test"

---

### 9. Admin: Pipeline Trace (`screen: 'adminTrace'`)
**Purpose:** Step-by-step accordion view of the AI pipeline output for the submitted document.

- `max-width: 780px`
- Header: sandbox banner (compact) + "New test" button
- 5 accordion cards, each with: step number badge (26×26px, `border-radius: 8px, background: var(--accent-weak), color: var(--accent), font-family: IBM Plex Mono`), title + subtitle, right-side status/metric badge, chevron. Click header to expand.

**Step 1 — Scraper:** 3 metric tiles (documents discovered, doc-type classification, county circuit-breaker). Tiles: `background: #f8f9fa, border-radius: 9px, padding: 12px 14px`.

**Step 2 — Extraction (Docling):** parent/child chunk counts + extracted text preview (IBM Plex Mono, `font-size: 12px, max-height: 140px, overflow: hidden`).

**Step 3 — Classifier/filter:** table of chunks with ID, text preview, and `is_project` badge (passed: accent colors, filtered: gray). Passed chunks shown in accent, filtered in gray.

**Step 4 — Classifier/extraction:** dark code block (`background: #1f2430, border-radius: 10px`), JSON-style extracted fields. Keys in `color: #7d8aa3`, string values in teal, numbers/booleans in accent.

**Step 5 — Relevance scoring:** score bar (`height: 8px, border-radius: 5px`, filled to score%), score value in IBM Plex Mono, rationale text in accent-weak card.

---

## Reusable Components

### Project Card
Used in: Dashboard new matches, Lead Feed, Tracked Projects.

```
white bg, border: 1px solid #e8eaed, border-radius: 13px
padding: var(--cardpad) [20px airy / 14px compact]
display: flex, flex-direction: column, gap: 11px
cursor: pointer
hover: box-shadow: 0 6px 20px rgba(15,23,42,.08), border-color: #dadee2, transform: translateY(-1px)
transition: box-shadow .15s, border-color .15s, transform .15s
```

Contents (top to bottom):
1. Project name (`font-weight: 600, font-size: 15px`) + agency (`font-size: 12.5px, color: #7a828d`) + bookmark button (right, 30×30px, `border-radius: 8px`)
2. Stage badge + match badge (see Badge components)
3. [Compact/Detailed only] Budget (IBM Plex Mono, `font-size: 13.5px, font-weight: 500`) + tags (gray pills)
4. [Detailed only] Rationale text (`font-size: 12.5px, color: #7a828d, line-height: 1.5`, separated by `border-top: 1px solid #f0f2f4`)

**Bookmark button states:**
- Tracked: `background: var(--accent-weak), color: var(--accent)`
- Untracked: `background: transparent, color: #9aa3af`
- `transition: all .12s`

### Stage Badge
```
display: inline-flex, align-items: center
font-size: 11.5px, font-weight: 600
padding: 3px 9px, border-radius: 6px
white-space: nowrap
```
Colors by stage:
- Early Planning: `color: #5b667a, background: #eef1f5`
- Approved: `color: #4f46e5, background: #ecedfd`
- Out for Bid: `color: #c2410c, background: #fcebe1`
- Awarded: `color: #15803d, background: #e6f3ea`
- Closed: `color: #8a93a0, background: #f1f3f5`

### Match Badge
```
display: inline-flex, align-items: center, gap: 5px
font-family: IBM Plex Mono, font-size: 11px, font-weight: 500
color: var(--accent), background: var(--accent-weak)
padding: 2px 8px, border-radius: 6px
```
Includes 5px accent dot before the text.

### Stage Change Graphic
Used in Dashboard update rows and Project Updates timeline. Renders `from-stage-badge → arrow SVG → to-stage-badge`:
- From badge: same as Stage Badge but `opacity: 0.6` (dimmed = past state)
- Arrow: `width: 15px, stroke: #b6bcc4, stroke-width: 1.6`
- To badge: full opacity (current state)
- Container: `display: flex, align-items: center, gap: 7px, margin-top: 5px, flex-wrap: wrap`

### County Dropdown
Custom replacement for `<select>`. See Lead Feed section above for full spec. Key behavior:
- Stores user-added counties in state (eventually: user profile settings in DB)
- `data-county-drop` attribute used for click-outside detection
- `z-index: 200` so it overlays the card grid below

---

## Interactions & Behavior

| Interaction | Behavior |
|---|---|
| Click project card | Navigate to `details` screen, set `selectedId` |
| Click bookmark icon | Toggle tracked state, prevent card click event bubbling |
| Click stage chip | Set `filters.stage`, re-filter feed |
| County dropdown | Custom dropdown with add-county inline form |
| Min match slider | Range 0–95, filter projects with `match >= value` |
| Text search | Filters by `name` or `agency` (case-insensitive substring) |
| "View all →" | Navigate to feed screen |
| Back button | Return to previous screen (feed or dashboard) |
| Role switcher | Toggles admin nav items; if admin-only screen active when switching to User, redirect to dashboard |
| Track from details | Same toggle as card bookmark |
| Admin Run Test | Navigate to `adminTrace` screen (real: trigger pipeline job) |
| Stage accordion | Toggle individual step open/closed |

**Animations:**
- Screen entry: `@keyframes bvUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }`, duration `0.28s ease`
- Card hover lift: `transform: translateY(-1px)`, `transition: .15s`
- Dropdown open: no animation (instant); can add subtle fade if desired
- Focus rings: `box-shadow: 0 0 0 3px var(--accent-weak)`, `transition` on border-color

---

## State Management

```ts
interface AppState {
  screen: 'auth' | 'dashboard' | 'feed' | 'details' | 'tracked' | 'updates' | 'adminInput' | 'adminTrace'
  role: 'user' | 'admin'
  selectedId: string                        // active project detail
  tracked: Record<string, boolean>          // projectId → bookmarked
  company: string                           // onboarding
  onbCats: string[]                         // selected service categories
  onbGeos: string[]                         // selected county coverage
  filters: {
    stage: string                           // 'all' | stage key
    county: string                          // 'all' | county name
    tag: string                             // 'all' | tag name
    minMatch: number                        // 0–95
    query: string                           // free text search
  }
  countyDropOpen: boolean
  countyAddMode: boolean
  countyInput: string
  addedCounties: string[]                   // user-added counties (persist to profile)
}
```

**Backend integration points:**
- `tracked` → saved to user profile (POST/DELETE `/api/tracks/{projectId}`)
- `filters` → query params on `/api/projects` endpoint
- `addedCounties` → saved to user profile geography (`PATCH /api/profile`)
- `onbCats` / `onbGeos` → set during onboarding (`POST /api/profile`)
- Admin Run Test → `POST /api/admin/pipeline/test` with `{ url, profile }`
- Admin Trace → `GET /api/admin/pipeline/trace/{jobId}`

---

## Data Model

### Project
```ts
interface Project {
  id: string
  name: string
  agency: string
  county: string
  budget: number                            // raw dollars
  stage: 'subcommittee' | 'approved' | 'bidding' | 'awarded' | 'closed'
  match: number                             // 0–100 relevance score
  type: string                              // e.g. "Roadway", "Parks & Recreation"
  tracking: string                          // e.g. "OC-2026-0417"
  deadline: string                          // formatted date string or "Closed"
  location: string                          // "City, FL · County"
  requirements: string                      // full requirements text
  tags: string[]                            // niche trade tags
  rationale: string                         // AI-generated explanation
  changed: boolean                          // stage changed since last visit
  from?: string                             // previous stage key (if changed)
  to?: string                               // new stage key (if changed)
  ago?: string                              // human-readable time of change
}
```

### Pipeline Stages (ordered)
```
subcommittee → approved → bidding → awarded → closed
```
Display labels: Early Planning, Approved, Out for Bid, Awarded, Closed

---

## Design Tokens

### Accent Colors (user-selectable)
| Name | Primary | Strong | Weak (bg tint) |
|---|---|---|---|
| Teal (default) | `#0f766e` | `#0c5e57` | `#e6f2f0` |
| Blue | `#2563eb` | `#1d4ed8` | `#eaf0fe` |
| Green | `#15803d` | `#126b33` | `#e7f3eb` |
| Orange | `#ea580c` | `#c2480a` | `#fdeee6` |
| Slate | `#334155` | `#1e293b` | `#eef1f5` |

CSS variables: `--accent`, `--accent-strong`, `--accent-weak`

### Spacing (density-aware)
| Token | Airy | Compact |
|---|---|---|
| `--cardpad` | `20px` | `14px` |
| `--cardgap` | `16px` | `11px` |
| `--pad` (page) | `32px` | `22px` |
| `--sectiongap` | `44px` | `30px` |

### Typography
- **Body / UI:** Hanken Grotesk — weights 400, 500, 600, 700
- **Monospace / data:** IBM Plex Mono — weights 400, 500
- Google Fonts CDN: `https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500`

### Colors
| Role | Value |
|---|---|
| Page background | `#f6f7f8` |
| Card background | `#fff` |
| Card border | `#e8eaed` |
| Card border hover | `#dadee2` |
| Sidebar border | `#e9ebee` |
| Header border | `#eceef0` |
| Dividers | `#eef0f2` / `#f0f2f4` |
| Text primary | `#16191d` |
| Text secondary | `#7a828d` |
| Text tertiary | `#9aa3af` |
| Text disabled | `#a8b0ba` |
| Input border | `#e6e8eb` |
| Tag bg | `#f3f4f6` |
| Tag text | `#6b7280` |
| Admin sandbox bg | `#fdf6e8` |
| Admin sandbox border | `#f3e3b8` |
| Admin sandbox text | `#8a6a18` |

### Border Radius
- Page cards: `13px`
- Inputs, selects: `9px`
- Buttons (primary): `10px`
- Buttons (secondary/small): `9px`
- Chips/pills: `8px` (square) or `20px` (rounded)
- Avatar: `50%`
- Nav items: `9px`
- Code block: `10px`
- Step number badges: `8px`

### Shadows
- Card hover: `0 6px 20px rgba(15,23,42,.08)`
- Update row hover: `0 4px 14px rgba(15,23,42,.06)`
- Dropdown: `0 8px 28px rgba(15,23,42,.11)`
- Role switcher active: `0 1px 3px rgba(0,0,0,.08)`

---

## Assets & Icons
All icons are inline SVGs using `stroke` (not fill), `stroke-width: 1.9` for nav/action icons, `stroke-width: 2` for utility icons. `stroke-linecap: round, stroke-linejoin: round`. ViewBox `0 0 24 24`.

Icons used:
- Home (dashboard nav)
- Search/magnifier (lead feed nav + search input)
- Bookmark (tracked nav + card bookmark toggle)
- Bell (project updates nav)
- Flask/beaker (testing console nav)
- Arrow left (back button)
- Arrow right (→ stage change)
- Chevron down (dropdown trigger, accordion)
- Plus (add county)
- Check (county dropdown selection)
- Play triangle (run test)
- Upload arrow (file upload zone)
- Star (why this matched)
- Warning triangle (sandbox banner)

---

## Files in This Package
- `Beaver.dc.html` — Full high-fidelity prototype. Open directly in a browser. All screens, states, and interactions are functional with mock data.
- `README.md` — This document.

---

## Notes for the Developer
1. The prototype uses mock data hardcoded in JS. Replace every `allProjects()` call with a real API fetch.
2. The "county" filter uses a custom dropdown (not native `<select>`) to support the inline "Add county" flow — preserve this pattern in the real UI.
3. The stage change graphic (from→to pills with arrow) appears in two places: Dashboard updates and Project Updates timeline. Build it as a shared component.
4. The Admin Testing Console and Trace View are real screens — they represent actual pipeline visibility tooling the team uses. Wire them to real pipeline job endpoints.
5. The `match` score, `rationale`, and `tags` are all AI-generated fields from the pipeline — they should come from BigQuery / your data store, not be computed on the frontend.
6. The Tweaks panel (accent color, density, card layout) is a prototype-only concept for exploring variants. In production, density/layout preferences could become user settings; accent color is brand-fixed.
