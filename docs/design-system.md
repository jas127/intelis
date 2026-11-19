# Intelis — Design System & Visual Direction

**Brand:** Intelis — The Market, Understood.  
**Tone:** Editorial, luminous, precise, and confident—closer to a modern spatial research publication or premium analytical studio than a generic SaaS admin dashboard.

---

## 1. Core Design Philosophy

- **Light Theme First (No Default Dark Mode):** Warm, tactile off-white canvases that keep long analytical sessions comfortable and make colourful data encodings pop with clarity.
- **Generous Whitespace & Quiet Chrome:** Let the map, charts, and numbers carry visual weight. Prefer clean hairlines, tonal surface shifts, and clear typographic hierarchy over boxes-within-boxes.
- **Colour as Meaning, Not Decoration:** Every accent colour has a defined semantic role across UI controls, map choropleths, and ECharts series.

### Explicit Anti-Patterns (Avoid)
- Dark mode as default or dark-slate "cyber" dashboards.
- Default Streamlit layouts or generic admin templates (heavy sidebars, KPI card grids stacked everywhere).
- Excessive cards, heavy drop shadows, or nested bordered containers.
- Unnecessary background gradients or glassmorphism gimmicks.
- Generic AI-generated landing page aesthetics (purple-blue hero blobs, buzzword feature grids).

---

## 2. Colour Palette

### Surfaces & Neutrals (Warm Off-White Foundation)

| Token | Hex | Usage |
| --- | --- | --- |
| `--bg-canvas` | `#FAF8F4` | Primary page canvas (warm off-white) |
| `--bg-surface` | `#F3EFE8` | Secondary panels, filter rails, subtle tonal separation |
| `--bg-elevated` | `#FFFFFF` | Floating map controls, popovers, selected inspector sheets |
| `--border-subtle` | `#E6E0D6` | Hairline dividers, table rules, quiet panel edges |
| `--text-primary` | `#181A1F` | Primary headings, key metrics, body text |
| `--text-secondary` | `#555B66` | Labels, metadata, axis titles, helper copy |
| `--text-muted` | `#848B96` | Captions, attribution, disabled states |

### Brand & Analytical Accents

| Token | Hex | Role |
| --- | --- | --- |
| `--accent-cobalt` | `#1E4FD8` | **Primary accent:** active navigation, primary CTA, selected ward outline, primary chart series |
| `--accent-cobalt-soft` | `#E9EFFD` | Active pill tint, subtle selection fill |
| `--accent-coral` | `#EB5E47` | **Warm highlight:** high-opportunity / high-intensity hotspots, alert callouts, comparison Series B |
| `--accent-orange` | `#F28C28` | **Warm highlight:** secondary intensity tier, growth/demand markers |
| `--accent-lavender` | `#7E6DF2` | **Secondary accent:** demographic/contextual overlay, benchmark line, category differentiator |
| `--accent-green` | `#1B9A6B` | **Secondary accent:** positive coverage, accessibility/supply balance, verified data badges |

---

## 3. Typography

- **Display & UI Sans:** `Plus Jakarta Sans` (or `Instrument Sans`) — crisp geometric warmth with strong legibility at small UI sizes.
- **Data & Tabular Numerals:** `JetBrains Mono` (or `IBM Plex Mono`) with `font-variant-numeric: tabular-nums` for coordinates, counts, ratios, percentages, and chart tooltips so numbers align cleanly.
- **Hierarchy Rules:**
  - Generous line-height (`1.5` for prose, `1.2` for headings).
  - Uppercase tracked micro-labels (`11px`, `letter-spacing: 0.06em`, `--text-secondary`) for metric captions rather than loud icons.

---

## 4. Layout & Spatial Composition

- **Map-First Workspace:** On the primary Explorer view, the interactive MapLibre canvas occupies the dominant viewport area, paired with a slim top bar (city & category switcher, search) and a collapsible right-hand Inspector drawer for the selected ward/zone—avoiding cluttered multi-column card walls.
- **Comparison & Deep-Dive Views:** Structured editorial grid with generous outer margins (`24px–48px`), clean horizontal rules separating analytical sections, and paired ECharts visualisations with concise methodology notes.
- **Responsive Behaviour:** Desktop splits map + inspector seamlessly; tablet/mobile transitions the inspector into a clean bottom sheet with touch-friendly controls.
- **Thoughtful Micro-Interactions:** Smooth map fly-to transitions on ward selection, subtle synchronized hover highlighting between ECharts bars/scatter plots and MapLibre polygons, and crisp state transitions (`150ms–200ms ease-out`).

---

## 5. MapLibre GL JS Visual Direction

- **Custom Light Basemap:** Warm parchment/off-white land (`#F6F3EC`), soft pale-blue water (`#DCE8F7`), muted warm-grey roads (`#E3DDD3`), and restrained place labels so analytical layers remain the clear focal point.
- **Choropleth Ramps:**
  - *Primary Density / Opportunity Ramp:* Warm ivory (`#FAF6EE`) → Soft sky (`#BDD2FA`) → Cobalt (`#1E4FD8`) or Coral-Orange sequential ramp for demand/competition hotspots.
  - *Diverging Comparisons:* Cobalt (`#1E4FD8`) ↔ Warm Neutral (`#F3EFE8`) ↔ Coral (`#EB5E47`).
- **Missing Data Treatment:** Distinct light diagonal hatch or muted warm grey (`#E6E0D6`) with explicit `"No verified source data"` tooltip—never rendered as zero.

---

## 6. Apache ECharts Visual Direction

- **Shared Theme Module (`lib/echarts-theme.ts`):** All charts inherit a single registered Intelis light theme:
  - Transparent canvas background (inherits `--bg-canvas` or `--bg-elevated`).
  - Subtle dashed horizontal gridlines (`#E6E0D6`), no heavy axis boxes.
  - Series colour order: Cobalt (`#1E4FD8`), Coral (`#EB5E47`), Green (`#1B9A6B`), Lavender (`#7E6DF2`), Orange (`#F28C28`).
  - Crisp white tooltip with `1px solid #E6E0D6` border, tabular numbers, and source/unit labels.
- **Readable Visualisations:** Prefer ranked horizontal bar charts, scatter/quadrant plots (e.g., Demand vs. Competition), distribution histograms, and small multiples over cluttered pie charts or 3D effects.
