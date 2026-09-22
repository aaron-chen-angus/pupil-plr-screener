# PLR Screener — Live Monitoring & Analytics Dashboard (R Shiny)

A real-time, scientific, and educational analytics dashboard for the
[PLR Screener](../README.md) web app. It ingests completed screenings **live**
from the Google Sheet the web app writes to, monitors incoming sessions,
produces a comprehensive suite of visualizations, computes descriptive and
inferential statistics, and explains how each pupillary light reflex (PLR)
metric is derived and interpreted.

## 🔗 Live dashboard

**Hosted app:** <https://smile-rp.shinyapps.io/SMILE_PLRscreener/>

The dashboard is deployed on [shinyapps.io](https://www.shinyapps.io/) and reads
the shared results Google Sheet on an anonymous, read-only basis, so it can be
opened directly in a browser with no R installation. The instructions below are
for running or redeploying it locally.

The interface uses the **"TRON" visual theme** shared with the Virtual BlazePod
suite: a deep space-black canvas with a faint cyan grid, neon orange + cyan
accents, glowing panels, and the Orbitron (headings) / Exo 2 (body) type pairing.
This is purely cosmetic — the data pipeline, statistics, and layout are
unchanged. The two Google Fonts load over HTTPS at runtime.

> ⚠️ **Not a medical device.** Screening / teaching demonstrator only. Nothing in
> this dashboard is a diagnosis or a clinically validated cutoff. All values are
> illustrative; the asymmetry threshold is an unvalidated screening parameter.

## Role in the system

```
 ┌───────────────────┐      HTTPS POST       ┌──────────────────────┐
 │  PLR web app       │  (one row / session)  │  Google Apps Script  │
 │  (phone browser)   │ ────────────────────▶ │  Web App (doPost)    │
 └───────────────────┘                        └──────────┬───────────┘
                                                          │ appendRow
                                                          ▼
                                              ┌──────────────────────┐
                                              │  Google Sheet         │
                                              │  (one row per test)   │
                                              └──────────┬───────────┘
                                                          │ CSV export (read-only)
                                                          ▼
                                              ┌──────────────────────┐
                                              │  R Shiny dashboard    │
                                              │  (this app)           │
                                              └──────────────────────┘
```

The dashboard is strictly a **read-only consumer** of the sheet. It never writes
back, so it cannot alter or corrupt collected data.

## What you get

- **Live monitor** — auto-refreshing feed of the most recent sessions, KPI value
  boxes (total, today, most-recent, stream state), a sessions-over-time chart, an
  indicator donut, and a live quality snapshot.
- **Overview & KPIs** — headline numbers: reliable %, symmetric %, real-stimulus
  %, and mean constriction / latency / velocity / asymmetry.
- **Distributions** — per-metric histograms + density, by eye, plus a faceted
  view of every summary metric at once.
- **Left vs right eye** — paired boxplots, an agreement scatter (points on the
  diagonal = symmetric), and per-eye means with 95% CIs.
- **Asymmetry** — score-vs-threshold plot, indicator breakdown, and a Δ%con vs
  Δvelocity "drivers" scatter.
- **Correlations** — Pearson correlation heatmap of the numeric metrics.
- **Demographics** — age and gender breakdowns and an exploratory age-vs-reflex
  trend.
- **Statistics** — descriptive stats table, paired t-test / Wilcoxon for
  left-vs-right, and a reliability/quality summary.
- **How it works** — plain-language explainer of PLR physiology, each metric, how
  to read the charts, and interpretation cautions.
- **Raw data** — the filtered records with column filters and a CSV download.

Global controls in the sidebar: **auto-refresh** toggle, **reliable-only** filter,
**refresh now**, plus **date range** and **gender** filters that apply everywhere.

## Prerequisites

1. **R ≥ 4.1** — <https://cloud.r-project.org/>. RStudio is optional but handy.
2. The **Google Sheet must be link-viewable** ("Anyone with the link → Viewer").
   It already is if the web app can write to it and you can open the share link.
3. Internet access (the dashboard pulls the sheet's CSV export on each refresh).

## Install the R packages

The app auto-installs anything missing on first launch. To do it manually:

```r
install.packages(c(
  "shiny","shinydashboard","shinyWidgets","ggplot2","dplyr","tidyr",
  "readr","plotly","DT","lubridate","scales","stringr","tibble"
))
```

## Run it

From a terminal **in this `r-dashboard/` folder**:

```bash
Rscript -e "shiny::runApp('app.R', launch.browser = TRUE)"
```

or open `app.R` in RStudio and click **Run App**.

The dashboard opens in your browser and immediately reads the sheet. New
screenings appear automatically (default refresh every 15 seconds); use
**Refresh now** to pull immediately.

## Configuration

All settings are near the top of `app.R` under `# CONFIGURATION`:

| Setting | Purpose |
|---|---|
| `SHEET_ID` | The Google Sheet id (from its URL). Defaults to this deployment's results sheet. |
| `SHEET_GID` | The tab id; `0` is the first tab. |
| `REFRESH_MS` | Auto-refresh interval in milliseconds (default `15000`). |
| `PAL` | Colour palette (colour-blind friendly). |
| `EXPECTED_COLS` | The 25 columns the web app posts — matches `app/sheets.js`. |

### How the live read works

The dashboard fetches the sheet via its public CSV export endpoint:

```
https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=<GID>
```

No Google login or API key is required for a link-shared sheet. Values are then
typed and cleaned (numbers, logicals, ISO timestamps) and reconciled against the
expected 25-column schema, so the app degrades gracefully if a column is missing
or the sheet is briefly unreachable (it shows an empty state instead of erroring).

## Technical architecture

| Layer | Implementation |
|---|---|
| **Runtime** | R (≥ 4.1) + Shiny; single-file `app.R` (UI + server + data layer). |
| **UI framework** | `shinydashboard` (sidebar + tabbed body) with `shinyWidgets` controls and a small custom CSS block for rounded cards and the disclaimer bar. |
| **Live ingestion** | `shiny::reactivePoll()` polls the Google Sheet CSV export on a fixed interval (`REFRESH_MS`, default 15 s). A `reactiveVal` bumped by the *Refresh now* button forces an immediate re-read; toggling *Auto-refresh* off freezes the poll's check value so no network calls are made until the next manual refresh. |
| **Parsing / typing** | `readr::read_csv()` → schema reconciliation against `EXPECTED_COLS` → numeric/logical coercion (`as_num`, `as_logical_loose`) → ISO-8601 parsing with `lubridate::ymd_hms()`. A typed zero-row tibble is returned on any error for graceful degradation. |
| **Reactive filtering** | A single `data_f()` reactive applies the sidebar filters (reliable-only, date range, gender) and feeds every output, so all tabs stay consistent. |
| **Visualization** | `ggplot2` for all statistical graphics, wrapped in `plotly::ggplotly()` for interactivity (hover, zoom). A shared `theme_plr()` and a `plotlyize()` helper standardise typography, a colour-blind-safe palette, legend placement, and margins. |
| **Tables** | `DT` (DataTables) for the live feed, descriptive-statistics table, and filterable raw data with CSV download. |
| **State model** | Fully reactive and stateless between sessions; no database, no server-side files. Each browser session holds its own filtered view. |

### Metric registry

Metrics are defined once in a `METRICS` list (label, unit, plain-language note)
and reused across the metric pickers, axis labels, captions, and the statistics
table. Adding a metric in one place propagates it everywhere.

## Statistical & analytical methods

- **Descriptive statistics** — per metric and per eye: n, mean, SD, median, min,
  max. Computed on the current filtered set.
- **Interocular comparison** — right vs left agreement is shown as a scatter
  against the line of identity (`y = x`); systematic departure from the diagonal
  indicates a between-eye difference. Per-eye means are plotted with 95%
  confidence intervals (mean ± 1.96 · SEM).
- **Paired hypothesis tests** — for the selected metric, a **paired t-test**
  (parametric) and a **Wilcoxon signed-rank test** (non-parametric) compare the
  right and left eyes over sessions where both eyes were measured. Reported with
  the test statistic, degrees of freedom / V, p-value, and 95% CI of the mean
  difference. These are **exploratory** and not corrected for multiple
  comparisons.
- **Asymmetry composite** — mirrors the web app: `score = Δ%constriction +
  10 · Δmean-velocity`, classified against the (unvalidated) threshold into
  *symmetric* / *asymmetric* / *insufficient*. The dashboard visualises both the
  score and its two drivers.
- **Correlation structure** — a Pearson correlation matrix over the numeric
  metrics (pairwise-complete observations), rendered as an annotated heatmap.
  Columns with insufficient variance or n are dropped automatically.
- **Age association** — an exploratory linear fit of mean % constriction on age
  with a 95% confidence band, included to illustrate the commonly reported
  age-related decline in reflex amplitude (not established by this sample).

All analyses respect the **reliable-only** toggle, so low-quality, demo, or
no-stimulus runs can be excluded from statistics and figures with one click.

## Column schema

The dashboard expects the columns the web app writes (see
[`../DOCUMENTATION.md` §7.8](../DOCUMENTATION.md) and `../app/sheets.js`):

```
name, age, gender, testTakenAt,
createdAt, appVersion, stimulusDelivered, indicator,
asymmetryScore, asymmetryThreshold, unreliable,
right_baselineMm, right_minMm, right_percentConstriction, right_latencyMs,
right_meanVelocity, right_maxVelocity, right_reliable,
left_baselineMm, left_minMm, left_percentConstriction, left_latencyMs,
left_meanVelocity, left_maxVelocity, left_reliable
```

## Troubleshooting

- **Empty dashboard / "Waiting for data":** confirm the sheet is link-viewable and
  has at least one data row, and that `SHEET_ID` / `SHEET_GID` are correct. Open
  the CSV export URL (above) in a browser — you should see raw CSV.
- **A package fails to install:** install it manually with `install.packages()`;
  on Linux some packages (e.g. `readr`, `plotly`) need system libraries such as
  `libcurl`, `libssl`, and `libxml2`.
- **Timestamps show "—":** the sheet's `testTakenAt` / `createdAt` weren't valid
  ISO-8601. Newer sessions from the web app include them automatically.
- **Deploying online:** this dashboard is published at
  <https://smile-rp.shinyapps.io/SMILE_PLRscreener/>. Because the read is an
  anonymous CSV fetch, no secrets or OAuth need to be configured on the host.

## Deploying / updating the hosted app

The live app runs on [shinyapps.io](https://www.shinyapps.io/). To publish an
update from this folder:

```r
install.packages("rsconnect")   # once

rsconnect::setAccountInfo(
  name   = "smile-rp",           # the shinyapps.io account
  token  = "<TOKEN>",            # from shinyapps.io -> Account -> Tokens
  secret = "<SECRET>")

rsconnect::deployApp(
  appDir   = ".",                # this r-dashboard folder
  appName  = "SMILE_PLRscreener")
```

Notes:
- shinyapps.io detects the `library()` calls in `app.R` and installs those
  packages in the cloud image; the in-app `install.packages()` bootstrap is a
  no-op there because the packages are already present.
- The sheet must remain shared as **Anyone with the link → Viewer** for the
  hosted app to read it.
- Free-tier apps sleep when idle and wake on the next visit (first load may take
  a few seconds).
