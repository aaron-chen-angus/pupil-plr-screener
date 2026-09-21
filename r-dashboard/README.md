# PLR Screener — Live Monitoring & Analytics Dashboard (R Shiny)

A real-time, scientific, and educational dashboard for the
[PLR Screener](../README.md) web app. It reads completed screenings **live** from
the same Google Sheet the web app writes to, monitors incoming sessions,
produces comprehensive visualizations, computes summary statistics, and explains
how the pupillary light reflex (PLR) metrics are derived and interpreted.

> ⚠️ **Not a medical device.** Screening / teaching demonstrator only. Nothing in
> this dashboard is a diagnosis or a clinically validated cutoff.

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
- **Deploying online:** you can publish to [shinyapps.io](https://www.shinyapps.io/)
  with `rsconnect::deployApp()`. Since the read is an anonymous CSV fetch, no
  secrets need to be configured.
