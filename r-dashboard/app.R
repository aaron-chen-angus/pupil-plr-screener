# =============================================================================
# PLR Screener — Live Monitoring & Analytics Dashboard (R Shiny)
# =============================================================================
#
# A real-time, scientific, and educational dashboard for the Pupillary Light
# Reflex (PLR) Screener web app. It reads sessions LIVE from the Google Sheet
# that the web app writes to, monitors incoming data, produces comprehensive
# visualizations, computes summary statistics, and explains how the metrics
# are derived and interpreted.
#
# >>> NOT A MEDICAL DEVICE. Screening / teaching demonstrator only. Nothing here
#     is a diagnosis or a clinically validated cutoff. <<<
#
# -----------------------------------------------------------------------------
# HOW TO RUN
# -----------------------------------------------------------------------------
# 1. Install R (>= 4.1) and (optionally) RStudio.
# 2. Install the packages listed in REQUIRED_PACKAGES below. The app will try
#    to install any that are missing on first launch, or run manually:
#
#      install.packages(c(
#        "shiny","shinydashboard","shinyWidgets","ggplot2","dplyr","tidyr",
#        "readr","plotly","DT","lubridate","scales","stringr","corrplot"
#      ))
#
# 3. Make sure the Google Sheet is shared as "Anyone with the link can view"
#    (it already is if the web app can write to it and you can open the link).
# 4. Launch from a terminal in this folder:
#
#      Rscript -e "shiny::runApp('app.R', launch.browser = TRUE)"
#
#    or open app.R in RStudio and click "Run App".
#
# -----------------------------------------------------------------------------
# LIVE DATA SOURCE
# -----------------------------------------------------------------------------
# The dashboard reads the sheet through its CSV export endpoint (no Google
# login / API key required for a link-shared sheet). The Sheet ID below is the
# one this deployment writes to; change it if you point the web app elsewhere.
# =============================================================================

# ---- Package bootstrap ------------------------------------------------------
REQUIRED_PACKAGES <- c(
  "shiny", "shinydashboard", "shinyWidgets", "ggplot2", "dplyr", "tidyr",
  "readr", "plotly", "DT", "lubridate", "scales", "stringr", "tibble"
)

install_if_missing <- function(pkgs) {
  missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing)) {
    message("Installing missing packages: ", paste(missing, collapse = ", "))
    install.packages(missing, repos = "https://cloud.r-project.org")
  }
}
install_if_missing(REQUIRED_PACKAGES)

suppressPackageStartupMessages({
  library(shiny)
  library(shinydashboard)
  library(shinyWidgets)
  library(ggplot2)
  library(dplyr)
  library(tidyr)
  library(readr)
  library(plotly)
  library(DT)
  library(lubridate)
  library(scales)
  library(stringr)
  library(tibble)
})

# ---------------------------------------------------------------------------
# NAMESPACE SAFETY (do not remove)
# ---------------------------------------------------------------------------
# plotly / DT pull in jsonlite, which exports its OWN validate() (signature
# validate(txt), asserting is.character(txt)). Depending on package load order
# jsonlite::validate can mask shiny::validate on the search path, which breaks
# every `validate(need(...))` guard in the server with either:
#   "unused argument (need(...))"   or   "is.character(txt) is not TRUE".
# Pin the reactive-guard helpers to shiny explicitly so masking can never
# happen again, regardless of which packages are attached later.
validate <- shiny::validate
need     <- shiny::need

# =============================================================================
# CONFIGURATION
# =============================================================================

# Google Sheet that the PLR web app writes to (link-shared, viewable by anyone
# with the link). We read the first tab (gid = 0) as CSV.
SHEET_ID  <- "10gcGeJ8XRWaDYqvwquj0uh13LYmArTBcVFUNhDJVFZo"
SHEET_GID <- "0"
SHEET_CSV_URL <- sprintf(
  "https://docs.google.com/spreadsheets/d/%s/export?format=csv&gid=%s",
  SHEET_ID, SHEET_GID
)

# How often to poll the sheet for new rows (milliseconds).
REFRESH_MS <- 15000

# TRON palette — matched to the Virtual BlazePod design system.
# Cyan = right eye, orange = left eye, on a deep space-black canvas.
PAL <- list(
  right      = "#00e5ff",  # right eye (cyan)
  left       = "#ff6b00",  # left eye (orange)
  symmetric  = "#00e676",
  asymmetric = "#ff6b00",
  insufficient = "#6b7a99",
  accent     = "#00e5ff",
  accent2    = "#ff6b00",
  grid       = "#12314a",
  bg         = "#050810",
  panel      = "#0d1526",
  text       = "#e8eaf0",
  muted      = "#6b7a99"
)

# The 25 columns the web app posts, in order (see app/sheets.js -> buildSheetRow).
EXPECTED_COLS <- c(
  "name", "age", "gender", "testTakenAt",
  "createdAt", "appVersion", "stimulusDelivered", "indicator",
  "asymmetryScore", "asymmetryThreshold", "unreliable",
  "right_baselineMm", "right_minMm", "right_percentConstriction", "right_latencyMs",
  "right_meanVelocity", "right_maxVelocity", "right_reliable",
  "left_baselineMm", "left_minMm", "left_percentConstriction", "left_latencyMs",
  "left_meanVelocity", "left_maxVelocity", "left_reliable"
)

# =============================================================================
# DATA ACCESS & CLEANING
# =============================================================================

# A shared ggplot theme for a clean, publication-style look. Legends sit on the
# right so that ggplotly() does not overlap them with the x-axis title (a common
# issue where plotly ignores a "bottom" legend's reserved space).
# TRON dark plot theme: transparent panel so the dark card shows through,
# cyan-tinted grid, light text. Legends sit on the right so ggplotly() does not
# overlap them with the x-axis title.
theme_plr <- function(base_size = 13) {
  theme_minimal(base_size = base_size) +
    theme(
      plot.background = element_rect(fill = PAL$panel, color = NA),
      panel.background = element_rect(fill = PAL$panel, color = NA),
      legend.background = element_rect(fill = PAL$panel, color = NA),
      legend.key = element_rect(fill = PAL$panel, color = NA),
      plot.title = element_text(face = "bold", size = base_size + 2, color = PAL$text),
      plot.subtitle = element_text(color = PAL$muted),
      panel.grid.minor = element_blank(),
      panel.grid.major = element_line(color = PAL$grid),
      axis.title = element_text(face = "bold", color = PAL$text),
      axis.text = element_text(color = PAL$muted),
      legend.position = "right",
      legend.title = element_text(face = "bold", color = PAL$text),
      legend.text = element_text(color = PAL$text),
      strip.text = element_text(face = "bold", color = PAL$accent)
    )
}

# Finalize an interactive plotly chart: give it generous margins so axis titles
# never collide with the legend or the plot edge, and place the legend below the
# plot with its own reserved band. Use for every ggplotly() output.
plotlyize <- function(p, legend_bottom = TRUE) {
  gp <- ggplotly(p)
  gp <- layout(
    gp,
    paper_bgcolor = PAL$panel,
    plot_bgcolor = PAL$panel,
    font = list(color = PAL$text),
    margin = list(l = 70, r = 30, t = 50, b = if (legend_bottom) 110 else 70),
    legend = if (legend_bottom) {
      list(orientation = "h", x = 0.5, xanchor = "center",
           y = -0.28, yanchor = "top")
    } else {
      list(orientation = "v")
    }
  )
  config(gp, displayModeBar = FALSE)
}

# Coerce the loose "TRUE"/"FALSE"/"" strings that arrive from Sheets into logicals.
as_logical_loose <- function(x) {
  x <- tolower(trimws(as.character(x)))
  out <- rep(NA, length(x))
  out[x %in% c("true", "1", "yes")] <- TRUE
  out[x %in% c("false", "0", "no")] <- FALSE
  out
}

as_num <- function(x) suppressWarnings(as.numeric(as.character(x)))

# Read the sheet as CSV and normalise into a clean, typed data frame. Returns a
# zero-row (but correctly typed) frame on any failure so the UI degrades nicely.
fetch_sessions <- function() {
  empty <- tibble::tibble(
    name = character(), age = numeric(), gender = character(),
    testTakenAt = as.POSIXct(character()), createdAt = as.POSIXct(character()),
    appVersion = character(), stimulusDelivered = logical(),
    indicator = character(), asymmetryScore = numeric(),
    asymmetryThreshold = numeric(), unreliable = logical(),
    right_baselineMm = numeric(), right_minMm = numeric(),
    right_percentConstriction = numeric(), right_latencyMs = numeric(),
    right_meanVelocity = numeric(), right_maxVelocity = numeric(),
    right_reliable = logical(),
    left_baselineMm = numeric(), left_minMm = numeric(),
    left_percentConstriction = numeric(), left_latencyMs = numeric(),
    left_meanVelocity = numeric(), left_maxVelocity = numeric(),
    left_reliable = logical()
  )

  raw <- tryCatch(
    readr::read_csv(SHEET_CSV_URL, show_col_types = FALSE, progress = FALSE),
    error = function(e) NULL
  )
  if (is.null(raw) || nrow(raw) == 0) return(empty)

  df <- as.data.frame(raw, stringsAsFactors = FALSE)

  # Make sure every expected column exists even if the sheet has extra/missing ones.
  for (col in EXPECTED_COLS) if (!col %in% names(df)) df[[col]] <- NA
  df <- df[, EXPECTED_COLS, drop = FALSE]

  num_cols <- c(
    "age", "asymmetryScore", "asymmetryThreshold",
    "right_baselineMm", "right_minMm", "right_percentConstriction",
    "right_latencyMs", "right_meanVelocity", "right_maxVelocity",
    "left_baselineMm", "left_minMm", "left_percentConstriction",
    "left_latencyMs", "left_meanVelocity", "left_maxVelocity"
  )
  for (col in num_cols) df[[col]] <- as_num(df[[col]])

  logi_cols <- c("stimulusDelivered", "unreliable", "right_reliable", "left_reliable")
  for (col in logi_cols) df[[col]] <- as_logical_loose(df[[col]])

  df$testTakenAt <- suppressWarnings(lubridate::ymd_hms(df$testTakenAt, quiet = TRUE))
  df$createdAt   <- suppressWarnings(lubridate::ymd_hms(df$createdAt, quiet = TRUE))

  # Prefer the explicit test time; fall back to the result-created time.
  df$timestamp <- dplyr::coalesce(df$testTakenAt, df$createdAt)

  df$indicator <- ifelse(is.na(df$indicator) | df$indicator == "",
                         "unknown", tolower(trimws(df$indicator)))
  df$gender <- ifelse(is.na(df$gender) | df$gender == "",
                      "not_provided", df$gender)

  # Convenience derived fields for plotting.
  df$row_id <- seq_len(nrow(df))
  df$reliable_session <- !isTRUE_vec(df$unreliable)

  tibble::as_tibble(df)
}

# Vectorised "is TRUE" that treats NA as FALSE.
isTRUE_vec <- function(x) !is.na(x) & x

# Nicely label gender codes for display.
gender_label <- function(g) {
  dplyr::recode(g,
    female = "Female", male = "Male", other = "Other",
    prefer_not_to_say = "Prefer not to say", not_provided = "Not provided",
    .default = g
  )
}

# =============================================================================
# UI
# =============================================================================

header <- dashboardHeader(
  title = span(icon("eye"), "PLR Analytics"),
  titleWidth = 300
)

sidebar <- dashboardSidebar(
  width = 300,
  sidebarMenu(
    id = "tabs",
    menuItem("Live monitor", tabName = "live", icon = icon("wave-square")),
    menuItem("Overview & KPIs", tabName = "overview", icon = icon("gauge-high")),
    menuItem("Distributions", tabName = "dist", icon = icon("chart-area")),
    menuItem("Left vs right eye", tabName = "eyes", icon = icon("not-equal")),
    menuItem("Asymmetry", tabName = "asym", icon = icon("scale-unbalanced")),
    menuItem("Correlations", tabName = "corr", icon = icon("table-cells")),
    menuItem("Demographics", tabName = "demo", icon = icon("users")),
    menuItem("Statistics", tabName = "stats", icon = icon("square-root-variable")),
    menuItem("How it works", tabName = "edu", icon = icon("graduation-cap")),
    menuItem("Raw data", tabName = "raw", icon = icon("table")),
    tags$hr(),
    div(
      style = "padding: 0 15px;",
      materialSwitch("auto_refresh", "Auto-refresh (live)", value = TRUE,
                     status = "success", right = TRUE),
      materialSwitch("reliable_only", "Reliable sessions only", value = FALSE,
                     status = "primary", right = TRUE),
      actionBttn("refresh_now", "Refresh now", style = "material-flat",
                 color = "primary", size = "sm", block = TRUE,
                 icon = icon("rotate")),
      br(),
      uiOutput("date_filter_ui"),
      uiOutput("gender_filter_ui")
    )
  )
)

body <- dashboardBody(
  tags$head(
    # BlazePod fonts: Orbitron (display) + Exo 2 (body).
    tags$link(rel = "preconnect", href = "https://fonts.googleapis.com"),
    tags$link(rel = "preconnect", href = "https://fonts.gstatic.com",
              crossorigin = NA),
    tags$link(rel = "stylesheet", href = paste0(
      "https://fonts.googleapis.com/css2?",
      "family=Orbitron:wght@400;700;900&family=Exo+2:wght@300;400;600;700&display=swap"
    )),
    tags$style(HTML("
    /* ===== TRON THEME (Virtual BlazePod aesthetic) ===================== */
    :root {
      --clr-bg:      #050810;
      --clr-bg2:     #0a0f1e;
      --clr-surface: #0d1526;
      --clr-surface2:#111d35;
      --clr-primary: #ff6b00;   /* neon orange */
      --clr-cyan:    #00e5ff;    /* neon cyan  */
      --clr-text:    #e8eaf0;
      --clr-muted:   #6b7a99;
      --clr-line:    rgba(0,229,255,0.18);
      --glow-orange: 0 0 12px rgba(255,107,0,0.6), 0 0 30px rgba(255,107,0,0.25);
      --glow-cyan:   0 0 12px rgba(0,229,255,0.5), 0 0 28px rgba(0,229,255,0.2);
      --font-tron:   'Orbitron', monospace;
      --font-body:   'Exo 2', system-ui, sans-serif;
    }

    body, .content-wrapper, .right-side, .wrapper {
      background-color: var(--clr-bg) !important;
      color: var(--clr-text);
      font-family: var(--font-body);
    }
    /* Decorative Tron grid behind the content */
    .content-wrapper {
      background-image:
        linear-gradient(rgba(0,229,255,0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,255,0.05) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    /* Header / logo bar */
    .main-header .logo {
      font-family: var(--font-tron); font-weight: 900; letter-spacing: 0.06em;
      background: var(--clr-bg2) !important; color: var(--clr-cyan) !important;
      text-shadow: var(--glow-cyan); border-bottom: 1px solid var(--clr-line);
    }
    .main-header .navbar { background: var(--clr-bg2) !important;
      border-bottom: 1px solid var(--clr-line); }
    .main-header .sidebar-toggle { color: var(--clr-cyan) !important; }

    /* Sidebar */
    .main-sidebar, .left-side {
      background: var(--clr-bg2) !important;
      border-right: 1px solid var(--clr-line);
    }
    .sidebar-menu > li > a {
      font-family: var(--font-tron); font-size: 12px; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--clr-muted) !important;
    }
    .sidebar-menu > li.active > a, .sidebar-menu > li:hover > a {
      color: var(--clr-cyan) !important;
      background: rgba(0,229,255,0.06) !important;
      border-left: 3px solid var(--clr-primary) !important;
    }
    .sidebar-menu > li > a > .fa,
    .sidebar-menu > li > a > .fas,
    .sidebar-menu > li > a > .far { color: var(--clr-primary); }

    /* Boxes */
    .box {
      background: var(--clr-surface); color: var(--clr-text);
      border-radius: 10px; border: 1px solid var(--clr-line);
      border-top: 2px solid var(--clr-primary);
      box-shadow: 0 0 22px -14px var(--glow-cyan);
    }
    .box-header .box-title {
      font-family: var(--font-tron); font-size: 13px; letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--clr-cyan);
    }
    .box.box-solid.box-primary > .box-header,
    .box.box-solid.box-info > .box-header,
    .box.box-solid.box-warning > .box-header {
      background: linear-gradient(180deg, rgba(0,229,255,0.08), transparent);
      color: var(--clr-cyan);
      border-bottom: 1px solid var(--clr-line);
    }
    .box.box-solid.box-primary, .box.box-solid.box-info,
    .box.box-solid.box-warning {
      border: 1px solid var(--clr-line);
      border-top: 2px solid var(--clr-primary);
    }

    /* Value boxes (KPI cards) — override all shinydashboard colour variants */
    .small-box {
      border-radius: 10px; border: 1px solid var(--clr-line);
      background: var(--clr-surface) !important;
      box-shadow: 0 0 20px -12px var(--glow-cyan);
      overflow: hidden;
    }
    .small-box > .inner h3 {
      font-family: var(--font-tron); font-weight: 700; color: var(--clr-text);
      text-shadow: 0 0 10px rgba(0,229,255,0.25);
    }
    .small-box > .inner p {
      font-family: var(--font-tron); font-size: 11px; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--clr-muted);
    }
    .small-box .icon { color: rgba(0,229,255,0.25) !important; }
    /* Accent stripe colour per semantic value-box class */
    .small-box.bg-aqua, .small-box.bg-blue, .small-box.bg-light-blue,
    .small-box.bg-navy, .small-box.bg-teal { border-top: 2px solid var(--clr-cyan); }
    .small-box.bg-aqua .inner h3, .small-box.bg-blue .inner h3,
    .small-box.bg-light-blue .inner h3, .small-box.bg-navy .inner h3,
    .small-box.bg-teal .inner h3 { color: var(--clr-cyan); }
    .small-box.bg-green .inner h3 { color: #00e676; }
    .small-box.bg-green { border-top: 2px solid #00e676; }
    .small-box.bg-yellow .inner h3, .small-box.bg-orange .inner h3 { color: var(--clr-primary); }
    .small-box.bg-yellow, .small-box.bg-orange { border-top: 2px solid var(--clr-primary); }
    .small-box.bg-purple .inner h3 { color: var(--clr-cyan); }
    .small-box.bg-purple { border-top: 2px solid var(--clr-cyan); }

    /* Tables (DT) */
    .dataTables_wrapper { color: var(--clr-text); }
    table.dataTable { color: var(--clr-text); }
    table.dataTable thead th {
      font-family: var(--font-tron); font-size: 11px; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--clr-cyan);
      border-bottom: 1px solid var(--clr-line);
    }
    table.dataTable tbody td { border-top: 1px solid rgba(0,229,255,0.08); }
    table.dataTable.stripe tbody tr.odd { background: rgba(0,229,255,0.03); }
    .dataTables_wrapper .dataTables_paginate .paginate_button {
      color: var(--clr-cyan) !important;
    }
    .dataTables_filter input, .dataTables_length select {
      background: var(--clr-surface2); color: var(--clr-text);
      border: 1px solid var(--clr-line); border-radius: 4px;
    }

    /* Plain tables (renderTable) */
    .table { color: var(--clr-text); }
    .table > thead > tr > th { color: var(--clr-cyan); border-color: var(--clr-line); }
    .table > tbody > tr > td { border-color: rgba(0,229,255,0.08); }
    verbatim, pre {
      background: var(--clr-bg2) !important; color: var(--clr-text) !important;
      border: 1px solid var(--clr-line) !important; border-radius: 6px;
    }

    /* Inputs / selectors / switches */
    .form-control, .selectize-input, .selectize-dropdown {
      background: var(--clr-surface2) !important; color: var(--clr-text) !important;
      border: 1px solid var(--clr-line) !important; border-radius: 6px;
    }
    .selectize-input.focus { border-color: var(--clr-primary) !important;
      box-shadow: 0 0 0 2px rgba(255,107,0,0.25) !important; }
    .irs-bar, .irs-single { background: var(--clr-primary) !important; }
    .btn-primary, .bttn-primary {
      background: var(--clr-primary) !important; border-color: var(--clr-primary) !important;
      color: #050810 !important; font-family: var(--font-tron);
      text-transform: uppercase; letter-spacing: 0.08em;
      box-shadow: var(--glow-orange);
    }

    /* Disclaimer + educational cards */
    .disclaimer-bar {
      background: rgba(58,0,0,0.85); border: 1px solid #ff3333; color: #ffaaaa;
      padding: 9px 14px; border-radius: 8px; margin-bottom: 12px; font-size: 13px;
      box-shadow: 0 0 16px -6px rgba(255,51,51,0.5);
    }
    .disclaimer-bar b, .disclaimer-bar strong { color: #ff6a6a; }
    .edu-card {
      background: var(--clr-surface); border-radius: 10px; padding: 16px 20px;
      margin-bottom: 14px; border-left: 4px solid var(--clr-primary);
      border-top: 1px solid var(--clr-line); border-right: 1px solid var(--clr-line);
      border-bottom: 1px solid var(--clr-line); color: var(--clr-text);
    }
    .edu-card b { color: var(--clr-cyan); }
    .metric-note { color: var(--clr-muted); font-size: 12px; }
    .live-status { font-family: var(--font-tron); font-size: 12px;
      letter-spacing: 0.05em; color: var(--clr-cyan); }
    h2, h3, h4 { color: var(--clr-text); }
  "))),

  div(class = "disclaimer-bar",
      icon("triangle-exclamation"),
      strong(" Not a medical device."),
      " Screening / teaching demonstrator only. Values are illustrative and no",
      " clinical cutoff is implied. Do not use for diagnosis."
  ),

  tabItems(
    # ---- Live monitor -------------------------------------------------------
    tabItem(
      tabName = "live",
      fluidRow(
        valueBoxOutput("kpi_total_live", width = 3),
        valueBoxOutput("kpi_today", width = 3),
        valueBoxOutput("kpi_last_seen", width = 3),
        valueBoxOutput("kpi_stream_state", width = 3)
      ),
      fluidRow(
        box(
          title = tagList(icon("wave-square"), "Incoming sessions (most recent first)"),
          width = 8, status = "primary", solidHeader = TRUE,
          div(class = "live-status", textOutput("live_status")),
          br(),
          DTOutput("live_feed")
        ),
        box(
          title = tagList(icon("chart-line"), "Sessions over time"),
          width = 4, status = "primary", solidHeader = TRUE,
          plotlyOutput("live_timeline", height = 320)
        )
      ),
      fluidRow(
        box(
          title = tagList(icon("circle-half-stroke"), "Latest indicator mix"),
          width = 4, status = "info", solidHeader = TRUE,
          plotlyOutput("live_indicator_donut", height = 260)
        ),
        box(
          title = tagList(icon("gauge"), "Live quality snapshot"),
          width = 8, status = "info", solidHeader = TRUE,
          plotlyOutput("live_quality", height = 260)
        )
      )
    ),

    # ---- Overview -----------------------------------------------------------
    tabItem(
      tabName = "overview",
      fluidRow(
        valueBoxOutput("kpi_total", width = 3),
        valueBoxOutput("kpi_reliable", width = 3),
        valueBoxOutput("kpi_symmetric", width = 3),
        valueBoxOutput("kpi_stim", width = 3)
      ),
      fluidRow(
        valueBoxOutput("kpi_mean_con", width = 3),
        valueBoxOutput("kpi_mean_lat", width = 3),
        valueBoxOutput("kpi_mean_vel", width = 3),
        valueBoxOutput("kpi_mean_asym", width = 3)
      ),
      fluidRow(
        box(
          title = "What this dashboard shows", width = 12, status = "primary",
          solidHeader = TRUE, collapsible = TRUE,
          HTML(
            "<p>Each row in the linked Google Sheet is one completed PLR screening from the",
            " web app. This dashboard reads that sheet live and summarises the",
            " <b>pupillary light reflex (PLR)</b> metrics for both eyes: baseline and minimum",
            " pupil diameter, percent constriction, latency, and constriction velocity, plus an",
            " interocular <b>asymmetry</b> summary and quality flags. Use the tabs on the left to",
            " move from real-time monitoring, through distributions and eye comparisons, to formal",
            " statistics and an explainer of the science.</p>")
        )
      )
    ),

    # ---- Distributions ------------------------------------------------------
    tabItem(
      tabName = "dist",
      fluidRow(
        box(width = 4, status = "primary", solidHeader = TRUE,
            title = "Choose a metric",
            selectInput("dist_metric", NULL, choices = NULL),
            radioGroupButtons("dist_eye", "Eye", choices = c("Right", "Left", "Both"),
                              selected = "Both", justified = TRUE),
            materialSwitch("dist_density", "Overlay density", value = TRUE,
                           status = "primary", right = TRUE),
            p(class = "metric-note", textOutput("dist_caption"))
        ),
        box(width = 8, status = "primary", solidHeader = TRUE,
            title = "Distribution", plotlyOutput("dist_plot", height = 380))
      ),
      fluidRow(
        box(width = 12, status = "info", solidHeader = TRUE,
            title = "All summary metrics at a glance (faceted)",
            plotOutput("dist_facets", height = 460))
      )
    ),

    # ---- Left vs right ------------------------------------------------------
    tabItem(
      tabName = "eyes",
      fluidRow(
        box(width = 6, status = "primary", solidHeader = TRUE,
            title = "Right vs left — paired comparison",
            selectInput("eye_metric", "Metric", choices = NULL),
            plotlyOutput("eye_paired", height = 380)),
        box(width = 6, status = "primary", solidHeader = TRUE,
            title = "Right vs left — agreement (scatter)",
            plotlyOutput("eye_scatter", height = 420))
      ),
      fluidRow(
        box(width = 12, status = "info", solidHeader = TRUE,
            title = "Per-eye means with 95% confidence intervals",
            plotOutput("eye_means", height = 380))
      )
    ),

    # ---- Asymmetry ----------------------------------------------------------
    tabItem(
      tabName = "asym",
      fluidRow(
        box(width = 8, status = "primary", solidHeader = TRUE,
            title = "Asymmetry score vs threshold",
            plotlyOutput("asym_scatter", height = 400)),
        box(width = 4, status = "info", solidHeader = TRUE,
            title = "Indicator breakdown",
            plotlyOutput("asym_bar", height = 400))
      ),
      fluidRow(
        box(width = 12, status = "info", solidHeader = TRUE,
            title = "Between-eye differences (drivers of the composite score)",
            plotlyOutput("asym_drivers", height = 380))
      )
    ),

    # ---- Correlations -------------------------------------------------------
    tabItem(
      tabName = "corr",
      fluidRow(
        box(width = 12, status = "primary", solidHeader = TRUE,
            title = "Correlation matrix of numeric PLR metrics (Pearson)",
            plotOutput("corr_plot", height = 560),
            p(class = "metric-note",
              "Correlations use complete pairs of reliable sessions where available.",
              " Strong positive links between baseline and minimum diameter are expected;",
              " they share the same pupil.")
        )
      )
    ),

    # ---- Demographics -------------------------------------------------------
    tabItem(
      tabName = "demo",
      fluidRow(
        box(width = 6, status = "primary", solidHeader = TRUE,
            title = "Age distribution", plotlyOutput("demo_age", height = 340)),
        box(width = 6, status = "primary", solidHeader = TRUE,
            title = "Gender breakdown", plotlyOutput("demo_gender", height = 340))
      ),
      fluidRow(
        box(width = 12, status = "info", solidHeader = TRUE,
            title = "% constriction vs age (does the reflex change with age?)",
            plotlyOutput("demo_age_con", height = 380),
            p(class = "metric-note",
              "Exploratory only. A downward trend with age is commonly reported in the",
              " literature but this small screening sample cannot establish it."))
      )
    ),

    # ---- Statistics ---------------------------------------------------------
    tabItem(
      tabName = "stats",
      fluidRow(
        box(width = 12, status = "primary", solidHeader = TRUE,
            title = "Descriptive statistics (per metric)",
            DTOutput("stats_table"))
      ),
      fluidRow(
        box(width = 6, status = "info", solidHeader = TRUE,
            title = "Left vs right — paired t-test / Wilcoxon",
            selectInput("stat_metric", "Metric", choices = NULL),
            verbatimTextOutput("stat_test")),
        box(width = 6, status = "info", solidHeader = TRUE,
            title = "Reliability & quality summary",
            tableOutput("quality_table"))
      )
    ),

    # ---- Education ----------------------------------------------------------
    tabItem(
      tabName = "edu",
      fluidRow(
        box(width = 12, status = "primary", solidHeader = TRUE,
            title = "The pupillary light reflex (PLR), in brief",
            uiOutput("edu_intro"))
      ),
      fluidRow(
        box(width = 6, status = "info", solidHeader = TRUE,
            title = "What each metric means", uiOutput("edu_metrics")),
        box(width = 6, status = "info", solidHeader = TRUE,
            title = "How to read the charts", uiOutput("edu_reading"))
      ),
      fluidRow(
        box(width = 12, status = "warning", solidHeader = TRUE,
            title = "Interpretation cautions & limitations", uiOutput("edu_caveats"))
      )
    ),

    # ---- Raw data -----------------------------------------------------------
    tabItem(
      tabName = "raw",
      fluidRow(
        box(width = 12, status = "primary", solidHeader = TRUE,
            title = "Filtered session records",
            downloadButton("download_csv", "Download filtered CSV",
                           class = "btn-primary"),
            br(), br(),
            DTOutput("raw_table"))
      )
    )
  )
)

ui <- dashboardPage(header, sidebar, body, skin = "black")

# =============================================================================
# SERVER
# =============================================================================

server <- function(input, output, session) {

  # --- Live polling of the Google Sheet --------------------------------------
  # reactivePoll re-reads only when auto-refresh is on; the "Refresh now" button
  # forces an immediate re-read regardless.
  poll_trigger <- reactiveVal(0)
  observeEvent(input$refresh_now, poll_trigger(poll_trigger() + 1))

  raw_data <- reactivePoll(
    intervalMillis = REFRESH_MS,
    session = session,
    checkFunc = function() {
      # Change the check value when time passes (if auto-refresh) or on demand.
      if (isTRUE(input$auto_refresh)) paste(Sys.time(), poll_trigger())
      else paste("manual", poll_trigger())
    },
    valueFunc = function() fetch_sessions()
  )

  # --- Dynamic filter inputs -------------------------------------------------
  output$date_filter_ui <- renderUI({
    d <- raw_data()
    if (nrow(d) == 0 || all(is.na(d$timestamp))) return(NULL)
    rng <- range(as.Date(d$timestamp), na.rm = TRUE)
    dateRangeInput("date_filter", "Date range", start = rng[1], end = rng[2],
                   min = rng[1], max = rng[2])
  })

  output$gender_filter_ui <- renderUI({
    d <- raw_data()
    if (nrow(d) == 0) return(NULL)
    opts <- sort(unique(d$gender))
    names(opts) <- gender_label(opts)
    pickerInput("gender_filter", "Gender", choices = opts, selected = opts,
                multiple = TRUE, options = list(`actions-box` = TRUE))
  })

  # --- Filtered dataset used by every tab ------------------------------------
  data_f <- reactive({
    d <- raw_data()
    if (nrow(d) == 0) return(d)
    if (isTRUE(input$reliable_only)) d <- dplyr::filter(d, reliable_session)
    if (!is.null(input$date_filter) && !all(is.na(d$timestamp))) {
      d <- dplyr::filter(
        d,
        is.na(timestamp) |
          (as.Date(timestamp) >= input$date_filter[1] &
             as.Date(timestamp) <= input$date_filter[2])
      )
    }
    if (!is.null(input$gender_filter)) {
      d <- dplyr::filter(d, gender %in% input$gender_filter)
    }
    d
  })

  # Metric registry: label -> column, with unit and a short caption.
  METRICS <- list(
    percentConstriction = list(label = "% constriction", unit = "%",
      note = "Fraction the pupil shrank from baseline to minimum. Larger = brisker reflex."),
    baselineMm = list(label = "Baseline diameter", unit = "mm",
      note = "Dark-adapted (pre-flash) pupil size."),
    minMm = list(label = "Minimum diameter", unit = "mm",
      note = "Smallest pupil size reached after the light."),
    latencyMs = list(label = "Latency", unit = "ms",
      note = "Delay from light onset to the start of constriction."),
    meanVelocity = list(label = "Mean constriction velocity", unit = "mm/s",
      note = "Average speed of constriction."),
    maxVelocity = list(label = "Max constriction velocity", unit = "mm/s",
      note = "Peak speed of constriction.")
  )

  observe({
    choices <- setNames(names(METRICS), vapply(METRICS, `[[`, character(1), "label"))
    updateSelectInput(session, "dist_metric", choices = choices,
                      selected = "percentConstriction")
    updateSelectInput(session, "eye_metric", choices = choices,
                      selected = "percentConstriction")
    updateSelectInput(session, "stat_metric", choices = choices,
                      selected = "percentConstriction")
  })

  # Helper: long-format eye data for a given base metric (e.g. "percentConstriction").
  eye_long <- function(d, metric) {
    rc <- paste0("right_", metric); lc <- paste0("left_", metric)
    if (!all(c(rc, lc) %in% names(d))) return(NULL)
    dplyr::bind_rows(
      dplyr::transmute(d, row_id, value = .data[[rc]], Eye = "Right"),
      dplyr::transmute(d, row_id, value = .data[[lc]], Eye = "Left")
    ) %>% dplyr::filter(!is.na(value))
  }

  # ==========================================================================
  # LIVE MONITOR
  # ==========================================================================
  output$kpi_total_live <- renderValueBox({
    valueBox(nrow(raw_data()), "Total sessions in sheet",
             icon = icon("database"), color = "aqua")
  })
  output$kpi_today <- renderValueBox({
    d <- raw_data()
    n <- if (nrow(d)) sum(as.Date(d$timestamp) == Sys.Date(), na.rm = TRUE) else 0
    valueBox(n, "Sessions today", icon = icon("calendar-day"), color = "green")
  })
  output$kpi_last_seen <- renderValueBox({
    d <- raw_data()
    lbl <- if (nrow(d) && any(!is.na(d$timestamp))) {
      format(max(d$timestamp, na.rm = TRUE), "%d %b %H:%M")
    } else "—"
    valueBox(span(style = "font-size: 24px;", lbl),
             "Most recent session", icon = icon("clock"), color = "purple")
  })
  output$kpi_stream_state <- renderValueBox({
    on <- isTRUE(input$auto_refresh)
    valueBox(if (on) "LIVE" else "Paused",
             sprintf("Refresh: %ds", REFRESH_MS / 1000),
             icon = icon(if (on) "signal" else "pause"),
             color = if (on) "green" else "yellow")
  })

  output$live_status <- renderText({
    d <- raw_data()
    sprintf("Last read %s — %d session(s) loaded from Google Sheets.",
            format(Sys.time(), "%H:%M:%S"), nrow(d))
  })

  output$live_feed <- renderDT({
    d <- raw_data()
    if (nrow(d) == 0)
      return(datatable(data.frame(Message = "Waiting for data from the sheet…"),
                       rownames = FALSE, options = list(dom = "t")))
    d %>%
      dplyr::arrange(dplyr::desc(dplyr::coalesce(timestamp, as.POSIXct(NA)))) %>%
      dplyr::transmute(
        When = ifelse(is.na(timestamp), "—", format(timestamp, "%d %b %H:%M")),
        Name = ifelse(is.na(name) | name == "", "(anon)", name),
        Age = age, Gender = gender_label(gender),
        Indicator = indicator,
        `R %con` = round(right_percentConstriction, 1),
        `L %con` = round(left_percentConstriction, 1),
        `Asym` = round(asymmetryScore, 1),
        Reliable = ifelse(reliable_session, "yes", "no")
      ) %>%
      datatable(rownames = FALSE, options = list(pageLength = 8, dom = "tp"),
                class = "compact stripe hover") %>%
      formatStyle("Indicator",
        color = styleEqual(
          c("symmetric", "asymmetric", "insufficient"),
          c("#00e676", "#ff6b00", "#6b7a99")),
        fontWeight = "bold",
        backgroundColor = styleEqual(
          c("symmetric", "asymmetric", "insufficient"),
          c("rgba(0,230,118,0.12)", "rgba(255,107,0,0.12)", "rgba(107,122,153,0.12)")))
  })

  output$live_timeline <- renderPlotly({
    d <- raw_data()
    validate(need(nrow(d) > 0 && any(!is.na(d$timestamp)), "No timestamped sessions yet."))
    by_day <- d %>% dplyr::filter(!is.na(timestamp)) %>%
      dplyr::mutate(day = as.Date(timestamp)) %>%
      dplyr::count(day)
    p <- ggplot(by_day, aes(day, n)) +
      geom_col(fill = PAL$accent, alpha = 0.85) +
      scale_x_date(labels = date_format("%d %b")) +
      labs(x = NULL, y = "Sessions") + theme_plr()
    plotlyize(p, legend_bottom = FALSE)
  })

  output$live_indicator_donut <- renderPlotly({
    d <- raw_data()
    validate(need(nrow(d) > 0, "No data yet."))
    tab <- d %>% dplyr::count(indicator)
    plot_ly(tab, labels = ~indicator, values = ~n, type = "pie", hole = 0.55,
            marker = list(
              colors = c("#ff6b00", "#6b7a99", "#00e676", "#00e5ff"),
              line = list(color = "#0d1526", width = 2))) %>%
      layout(showlegend = TRUE,
             paper_bgcolor = "#0d1526", plot_bgcolor = "#0d1526",
             font = list(color = "#e8eaf0"),
             legend = list(orientation = "h", x = 0.5, xanchor = "center",
                           y = -0.1, yanchor = "top"),
             margin = list(l = 20, r = 20, t = 20, b = 60)) %>%
      config(displayModeBar = FALSE)
  })

  output$live_quality <- renderPlotly({
    d <- raw_data()
    validate(need(nrow(d) > 0, "No data yet."))
    q <- tibble::tibble(
      Flag = c("Reliable", "Unreliable", "Stimulus delivered", "No stimulus"),
      Count = c(sum(d$reliable_session, na.rm = TRUE),
                sum(!d$reliable_session, na.rm = TRUE),
                sum(isTRUE_vec(d$stimulusDelivered)),
                sum(!isTRUE_vec(d$stimulusDelivered)))
    )
    p <- ggplot(q, aes(reorder(Flag, Count), Count, fill = Flag)) +
      geom_col(show.legend = FALSE) + coord_flip() +
      scale_fill_manual(values = c("Reliable" = PAL$symmetric,
        "Unreliable" = PAL$asymmetric, "Stimulus delivered" = PAL$right,
        "No stimulus" = PAL$insufficient)) +
      labs(x = NULL, y = "Sessions") + theme_plr() +
      theme(legend.position = "none")
    plotlyize(p, legend_bottom = FALSE)
  })

  # ==========================================================================
  # OVERVIEW KPIs
  # ==========================================================================
  safe_mean <- function(x) if (all(is.na(x))) NA_real_ else mean(x, na.rm = TRUE)
  both_eyes_mean <- function(d, metric) {
    safe_mean(c(d[[paste0("right_", metric)]], d[[paste0("left_", metric)]]))
  }

  output$kpi_total <- renderValueBox(
    valueBox(nrow(data_f()), "Sessions (filtered)", icon = icon("list-ol"),
             color = "aqua"))
  output$kpi_reliable <- renderValueBox({
    d <- data_f(); pct <- if (nrow(d)) round(100 * mean(d$reliable_session, na.rm = TRUE)) else 0
    valueBox(paste0(pct, "%"), "Reliable sessions", icon = icon("circle-check"),
             color = "green")
  })
  output$kpi_symmetric <- renderValueBox({
    d <- data_f(); pct <- if (nrow(d)) round(100 * mean(d$indicator == "symmetric", na.rm = TRUE)) else 0
    valueBox(paste0(pct, "%"), "Symmetric indicator", icon = icon("scale-balanced"),
             color = "teal")
  })
  output$kpi_stim <- renderValueBox({
    d <- data_f(); pct <- if (nrow(d)) round(100 * mean(isTRUE_vec(d$stimulusDelivered))) else 0
    valueBox(paste0(pct, "%"), "Real LED stimulus", icon = icon("lightbulb"),
             color = "yellow")
  })
  output$kpi_mean_con <- renderValueBox({
    v <- both_eyes_mean(data_f(), "percentConstriction")
    valueBox(ifelse(is.na(v), "—", paste0(round(v, 1), "%")),
             "Mean % constriction", icon = icon("compress"), color = "blue")
  })
  output$kpi_mean_lat <- renderValueBox({
    v <- both_eyes_mean(data_f(), "latencyMs")
    valueBox(ifelse(is.na(v), "—", paste0(round(v), " ms")),
             "Mean latency", icon = icon("stopwatch"), color = "light-blue")
  })
  output$kpi_mean_vel <- renderValueBox({
    v <- both_eyes_mean(data_f(), "meanVelocity")
    valueBox(ifelse(is.na(v), "—", paste0(round(v, 2), " mm/s")),
             "Mean velocity", icon = icon("gauge-high"), color = "navy")
  })
  output$kpi_mean_asym <- renderValueBox({
    d <- data_f(); v <- safe_mean(d$asymmetryScore)
    valueBox(ifelse(is.na(v), "—", round(v, 1)),
             "Mean asymmetry score", icon = icon("scale-unbalanced-flip"),
             color = "orange")
  })

  # ==========================================================================
  # DISTRIBUTIONS
  # ==========================================================================
  output$dist_caption <- renderText({
    m <- input$dist_metric; if (is.null(m) || !m %in% names(METRICS)) return("")
    METRICS[[m]]$note
  })

  output$dist_plot <- renderPlotly({
    d <- data_f(); m <- input$dist_metric
    validate(need(nrow(d) > 0, "No data for the current filters."),
             need(!is.null(m) && m %in% names(METRICS), "Pick a metric."))
    long <- eye_long(d, m)
    if (input$dist_eye != "Both") long <- dplyr::filter(long, Eye == input$dist_eye)
    validate(need(!is.null(long) && nrow(long) > 0, "No values to plot."))
    unit <- METRICS[[m]]$unit
    p <- ggplot(long, aes(value, fill = Eye, color = Eye)) +
      geom_histogram(aes(y = after_stat(density)), bins = 20,
                     alpha = 0.45, position = "identity")
    if (isTRUE(input$dist_density)) p <- p + geom_density(alpha = 0.08, linewidth = 0.9)
    p <- p +
      scale_fill_manual(values = c(Right = PAL$right, Left = PAL$left)) +
      scale_color_manual(values = c(Right = PAL$right, Left = PAL$left)) +
      labs(x = sprintf("%s (%s)", METRICS[[m]]$label, unit), y = "Density",
           fill = "Eye", color = "Eye") +
      theme_plr()
    plotlyize(p, legend_bottom = TRUE)
  })

  output$dist_facets <- renderPlot({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data for the current filters."))
    long <- purrr_map_metrics(d, names(METRICS), METRICS)
    validate(need(nrow(long) > 0, "No values to plot."))
    ggplot(long, aes(value, fill = Eye)) +
      geom_histogram(bins = 18, alpha = 0.6, position = "identity",
                     color = "#0d1526") +
      facet_wrap(~ metric_label, scales = "free", ncol = 3) +
      scale_fill_manual(values = c(Right = PAL$right, Left = PAL$left)) +
      labs(x = NULL, y = "Count", fill = "Eye",
           title = "Distribution of every summary metric, by eye") +
      theme_plr()
  })

  # Build a tidy long frame across several metrics (base R, no purrr dependency).
  purrr_map_metrics <- function(d, metrics, registry) {
    out <- lapply(metrics, function(m) {
      el <- eye_long(d, m)
      if (is.null(el) || nrow(el) == 0) return(NULL)
      el$metric <- m
      el$metric_label <- sprintf("%s (%s)", registry[[m]]$label, registry[[m]]$unit)
      el
    })
    dplyr::bind_rows(out)
  }

  # ==========================================================================
  # LEFT VS RIGHT
  # ==========================================================================
  output$eye_paired <- renderPlotly({
    d <- data_f(); m <- input$eye_metric
    validate(need(nrow(d) > 0, "No data."), need(!is.null(m), "Pick a metric."))
    long <- eye_long(d, m)
    validate(need(!is.null(long) && nrow(long) > 0, "No values to plot."))
    p <- ggplot(long, aes(Eye, value, fill = Eye)) +
      geom_boxplot(width = 0.5, alpha = 0.55, outlier.shape = NA) +
      geom_jitter(width = 0.08, alpha = 0.5, size = 1.6) +
      scale_fill_manual(values = c(Right = PAL$right, Left = PAL$left)) +
      labs(x = NULL, y = sprintf("%s (%s)", METRICS[[m]]$label, METRICS[[m]]$unit)) +
      theme_plr() + theme(legend.position = "none")
    plotlyize(p, legend_bottom = FALSE)
  })

  output$eye_scatter <- renderPlotly({
    d <- data_f(); m <- input$eye_metric
    validate(need(nrow(d) > 0, "No data."), need(!is.null(m), "Pick a metric."))
    rc <- paste0("right_", m); lc <- paste0("left_", m)
    dd <- d %>% dplyr::filter(!is.na(.data[[rc]]), !is.na(.data[[lc]]))
    validate(need(nrow(dd) > 0, "Need sessions with both eyes measured."))
    lim <- range(c(dd[[rc]], dd[[lc]]), na.rm = TRUE)
    p <- ggplot(dd, aes(.data[[rc]], .data[[lc]], color = indicator)) +
      geom_abline(slope = 1, intercept = 0, linetype = "dashed", color = "#6b7a99") +
      geom_point(size = 2.4, alpha = 0.8) +
      scale_color_manual(values = c(symmetric = PAL$symmetric,
        asymmetric = PAL$asymmetric, insufficient = PAL$insufficient,
        unknown = "grey60")) +
      coord_equal(xlim = lim, ylim = lim) +
      labs(x = paste("Right", METRICS[[m]]$label), y = paste("Left", METRICS[[m]]$label),
           color = "Indicator",
           subtitle = "Points on the dashed line = perfectly symmetric") +
      theme_plr()
    plotlyize(p, legend_bottom = TRUE)
  })

  output$eye_means <- renderPlot({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data."))
    long <- purrr_map_metrics(d, names(METRICS), METRICS)
    validate(need(nrow(long) > 0, "No values."))
    summ <- long %>% dplyr::group_by(metric_label, Eye) %>%
      dplyr::summarise(
        mean = mean(value, na.rm = TRUE),
        se = sd(value, na.rm = TRUE) / sqrt(dplyr::n()),
        .groups = "drop")
    ggplot(summ, aes(Eye, mean, fill = Eye)) +
      geom_col(width = 0.6, alpha = 0.85) +
      geom_errorbar(aes(ymin = mean - 1.96 * se, ymax = mean + 1.96 * se), width = 0.2) +
      facet_wrap(~ metric_label, scales = "free_y", ncol = 3) +
      scale_fill_manual(values = c(Right = PAL$right, Left = PAL$left)) +
      labs(x = NULL, y = "Mean (±95% CI)",
           title = "Per-eye means with 95% confidence intervals") +
      theme_plr()
  })

  # ==========================================================================
  # ASYMMETRY
  # ==========================================================================
  output$asym_scatter <- renderPlotly({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data."))
    dd <- dplyr::filter(d, !is.na(asymmetryScore))
    validate(need(nrow(dd) > 0, "No asymmetry scores yet."))
    thr <- suppressWarnings(stats::median(dd$asymmetryThreshold, na.rm = TRUE))
    thr_layer <- if (is.finite(thr)) {
      geom_hline(yintercept = thr, linetype = "dashed", color = PAL$asymmetric)
    } else {
      geom_blank()
    }
    p <- ggplot(dd, aes(row_id, asymmetryScore, color = indicator)) +
      thr_layer +
      geom_point(size = 2.6, alpha = 0.85) +
      scale_color_manual(values = c(symmetric = PAL$symmetric,
        asymmetric = PAL$asymmetric, insufficient = PAL$insufficient,
        unknown = "grey60")) +
      labs(x = "Session (in sheet order)", y = "Composite asymmetry score",
           color = "Indicator",
           subtitle = if (is.finite(thr)) paste("Dashed line = median threshold",
             round(thr, 1)) else NULL) +
      theme_plr()
    plotlyize(p, legend_bottom = TRUE)
  })

  output$asym_bar <- renderPlotly({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data."))
    tab <- d %>% dplyr::count(indicator)
    p <- ggplot(tab, aes(reorder(indicator, n), n, fill = indicator)) +
      geom_col(show.legend = FALSE) + coord_flip() +
      scale_fill_manual(values = c(symmetric = PAL$symmetric,
        asymmetric = PAL$asymmetric, insufficient = PAL$insufficient,
        unknown = "grey60")) +
      labs(x = NULL, y = "Sessions") + theme_plr() +
      theme(legend.position = "none")
    plotlyize(p, legend_bottom = FALSE)
  })

  output$asym_drivers <- renderPlotly({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data."))
    dd <- d %>% dplyr::mutate(
      dCon = abs(right_percentConstriction - left_percentConstriction),
      dVel = abs(right_meanVelocity - left_meanVelocity)
    ) %>% dplyr::filter(!is.na(dCon), !is.na(dVel))
    validate(need(nrow(dd) > 0, "Need both-eye data."))
    p <- ggplot(dd, aes(dCon, dVel, color = indicator, size = asymmetryScore)) +
      geom_point(alpha = 0.8) +
      scale_color_manual(values = c(symmetric = PAL$symmetric,
        asymmetric = PAL$asymmetric, insufficient = PAL$insufficient,
        unknown = "grey60")) +
      labs(x = "Delta % constriction (points)", y = "Delta mean velocity (mm/s)",
           color = "Indicator", size = "Score") + theme_plr()
    plotlyize(p, legend_bottom = TRUE)
  })

  # ==========================================================================
  # CORRELATIONS
  # ==========================================================================
  output$corr_plot <- renderPlot({
    d <- data_f()
    validate(need(nrow(d) >= 3, "Need at least 3 sessions for a correlation matrix."))
    num <- d %>% dplyr::select(dplyr::any_of(c(
      "age", "asymmetryScore",
      "right_baselineMm", "right_minMm", "right_percentConstriction",
      "right_latencyMs", "right_meanVelocity", "right_maxVelocity",
      "left_baselineMm", "left_minMm", "left_percentConstriction",
      "left_latencyMs", "left_meanVelocity", "left_maxVelocity"))) %>%
      dplyr::select(dplyr::where(
        ~ sum(!is.na(.)) >= 3 && isTRUE(sd(., na.rm = TRUE) > 0)))
    validate(need(ncol(num) >= 2, "Not enough varying numeric columns yet."))
    cm <- suppressWarnings(cor(num, use = "pairwise.complete.obs"))
    cm[is.na(cm)] <- 0
    df <- as.data.frame(as.table(cm))
    names(df) <- c("Var1", "Var2", "r")
    ggplot(df, aes(Var1, Var2, fill = r)) +
      geom_tile(color = "#0a0f1e") +
      geom_text(aes(label = sprintf("%.2f", r)), size = 3, color = "#e8eaf0") +
      scale_fill_gradient2(low = PAL$left, mid = "#0d1526", high = PAL$right,
                           midpoint = 0, limits = c(-1, 1)) +
      labs(x = NULL, y = NULL, fill = "Pearson r",
           title = "Correlation matrix of numeric PLR metrics") +
      theme_plr() +
      theme(axis.text.x = element_text(angle = 45, hjust = 1),
            panel.grid = element_blank())
  })

  # ==========================================================================
  # DEMOGRAPHICS
  # ==========================================================================
  output$demo_age <- renderPlotly({
    d <- data_f() %>% dplyr::filter(!is.na(age))
    validate(need(nrow(d) > 0, "No age data yet."))
    p <- ggplot(d, aes(age)) +
      geom_histogram(bins = 15, fill = PAL$accent, alpha = 0.85, color = "#0d1526") +
      labs(x = "Age (years)", y = "Sessions") + theme_plr()
    plotlyize(p, legend_bottom = FALSE)
  })

  output$demo_gender <- renderPlotly({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data yet."))
    tab <- d %>% dplyr::mutate(g = gender_label(gender)) %>% dplyr::count(g)
    p <- ggplot(tab, aes(reorder(g, n), n, fill = g)) +
      geom_col(show.legend = FALSE) + coord_flip() +
      labs(x = NULL, y = "Sessions") + theme_plr() +
      theme(legend.position = "none")
    plotlyize(p, legend_bottom = FALSE)
  })

  output$demo_age_con <- renderPlotly({
    d <- data_f() %>%
      dplyr::mutate(meanCon = rowMeans(
        cbind(right_percentConstriction, left_percentConstriction), na.rm = TRUE)) %>%
      dplyr::filter(!is.na(age), !is.na(meanCon), is.finite(meanCon))
    validate(need(nrow(d) >= 3, "Need at least 3 sessions with age + constriction."))
    p <- ggplot(d, aes(age, meanCon)) +
      geom_point(color = PAL$right, size = 2.4, alpha = 0.8) +
      geom_smooth(method = "lm", se = TRUE, color = PAL$accent2,
                  fill = "#ff6b00", alpha = 0.15) +
      labs(x = "Age (years)", y = "Mean % constriction (both eyes)") + theme_plr()
    plotlyize(p, legend_bottom = FALSE)
  })

  # ==========================================================================
  # STATISTICS
  # ==========================================================================
  output$stats_table <- renderDT({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data for the current filters."))
    rows <- lapply(names(METRICS), function(m) {
      long <- eye_long(d, m)
      if (is.null(long) || nrow(long) == 0) return(NULL)
      long %>% dplyr::group_by(Eye) %>%
        dplyr::summarise(
          n = sum(!is.na(value)),
          Mean = round(mean(value, na.rm = TRUE), 2),
          SD = round(sd(value, na.rm = TRUE), 2),
          Median = round(median(value, na.rm = TRUE), 2),
          Min = round(min(value, na.rm = TRUE), 2),
          Max = round(max(value, na.rm = TRUE), 2),
          .groups = "drop") %>%
        dplyr::mutate(Metric = sprintf("%s (%s)", METRICS[[m]]$label, METRICS[[m]]$unit),
                      .before = 1)
    })
    tab <- dplyr::bind_rows(rows)
    datatable(tab, rownames = FALSE, options = list(pageLength = 12, dom = "tp"),
              class = "compact stripe")
  })

  output$stat_test <- renderPrint({
    d <- data_f(); m <- input$stat_metric
    if (is.null(m) || !m %in% names(METRICS)) { cat("Pick a metric."); return() }
    rc <- paste0("right_", m); lc <- paste0("left_", m)
    dd <- d %>% dplyr::filter(!is.na(.data[[rc]]), !is.na(.data[[lc]]))
    if (nrow(dd) < 3) {
      cat("Need at least 3 paired sessions (both eyes measured) for a test.\n",
          "Currently available:", nrow(dd))
      return()
    }
    r <- dd[[rc]]; l <- dd[[lc]]
    cat("Metric:", METRICS[[m]]$label, "(", METRICS[[m]]$unit, ")\n")
    cat("Paired sessions:", nrow(dd), "\n")
    cat(sprintf("Right mean = %.2f | Left mean = %.2f | mean diff (R-L) = %.2f\n\n",
                mean(r), mean(l), mean(r - l)))
    tt <- tryCatch(t.test(r, l, paired = TRUE), error = function(e) NULL)
    if (!is.null(tt)) {
      cat("Paired t-test:\n")
      cat(sprintf("  t = %.3f, df = %d, p = %.4f\n", tt$statistic, tt$parameter, tt$p.value))
      cat(sprintf("  95%% CI of mean difference: [%.2f, %.2f]\n\n",
                  tt$conf.int[1], tt$conf.int[2]))
    }
    wt <- tryCatch(wilcox.test(r, l, paired = TRUE, exact = FALSE),
                   error = function(e) NULL)
    if (!is.null(wt))
      cat(sprintf("Wilcoxon signed-rank (non-parametric): V = %.1f, p = %.4f\n",
                  wt$statistic, wt$p.value))
    cat("\nNote: exploratory only; not corrected for multiple comparisons.")
  })

  output$quality_table <- renderTable({
    d <- data_f()
    if (nrow(d) == 0) return(data.frame(Metric = "No data", Value = "—"))
    data.frame(
      Metric = c("Total sessions", "Reliable", "Unreliable",
                 "Real LED stimulus", "Symmetric", "Asymmetric",
                 "Insufficient", "With age recorded", "With name recorded"),
      Value = c(
        nrow(d),
        sprintf("%d (%.0f%%)", sum(d$reliable_session, na.rm = TRUE),
                100 * mean(d$reliable_session, na.rm = TRUE)),
        sum(!d$reliable_session, na.rm = TRUE),
        sprintf("%d (%.0f%%)", sum(isTRUE_vec(d$stimulusDelivered)),
                100 * mean(isTRUE_vec(d$stimulusDelivered))),
        sum(d$indicator == "symmetric", na.rm = TRUE),
        sum(d$indicator == "asymmetric", na.rm = TRUE),
        sum(d$indicator == "insufficient", na.rm = TRUE),
        sum(!is.na(d$age)),
        sum(!is.na(d$name) & d$name != "")
      ), stringsAsFactors = FALSE)
  })

  # ==========================================================================
  # EDUCATION
  # ==========================================================================
  output$edu_intro <- renderUI({
    HTML(paste0(
      "<div class='edu-card'>",
      "<p>The <b>pupillary light reflex (PLR)</b> is the automatic constriction of the",
      " pupil when light hits the retina. Light is detected by photoreceptors and",
      " intrinsically photosensitive retinal ganglion cells; the signal travels the",
      " <i>afferent</i> path (optic nerve) to the midbrain, then returns via the",
      " <i>efferent</i> parasympathetic path (oculomotor nerve) to the iris sphincter,",
      " which contracts the pupil.</p>",
      "<p>This app shines the phone's LED, tracks the iris and pupil with computer",
      " vision, and measures how <b>much</b>, how <b>fast</b>, and how <b>soon</b> each",
      " pupil constricts. Comparing the two eyes gives a neutral <b>symmetric /",
      " asymmetric</b> indicator — a teaching signal, never a diagnosis.</p>",
      "</div>"
    ))
  })

  output$edu_metrics <- renderUI({
    items <- paste0(
      "<li><b>", vapply(METRICS, `[[`, character(1), "label"), "</b> (",
      vapply(METRICS, `[[`, character(1), "unit"), ") — ",
      vapply(METRICS, `[[`, character(1), "note"), "</li>", collapse = "")
    HTML(paste0("<div class='edu-card'><ul>", items,
      "<li><b>Asymmetry score</b> — a composite of the between-eye differences",
      " in % constriction and velocity. Higher = the two eyes behaved more",
      " differently.</li></ul></div>"))
  })

  output$edu_reading <- renderUI({
    HTML(paste0("<div class='edu-card'><ul>",
      "<li><b>Distributions</b> show the spread of a metric; a tight, symmetric",
      " histogram suggests consistent measurements.</li>",
      "<li><b>Left-vs-right scatter</b>: points on the diagonal mean the eyes agree.",
      " Systematic drift off the line hints at a real or artefactual difference.</li>",
      "<li><b>Asymmetry plot</b>: points above the dashed threshold line are flagged",
      " asymmetric. Watch for clustering.</li>",
      "<li><b>Correlations</b>: baseline and minimum diameter should correlate strongly",
      " (same pupil); velocity and % constriction often move together.</li>",
      "<li><b>Age vs % constriction</b>: the fitted line is exploratory — treat slopes",
      " cautiously with small samples.</li>",
      "</ul></div>"))
  })

  output$edu_caveats <- renderUI({
    HTML(paste0("<div class='edu-card' style='border-left-color:#E8A33D;'><ul>",
      "<li>This is a <b>screening / teaching demonstrator</b>, not a pupillometer and",
      " not a diagnostic device.</li>",
      "<li>Measurements use visible light and a phone camera; absolute millimetre values",
      " rely on an assumed iris diameter and are approximate.</li>",
      "<li>The asymmetry threshold is <b>unvalidated</b> — no clinical cutoff is implied.</li>",
      "<li>Sessions marked <b>unreliable</b> (or demo/no-stimulus runs) should be excluded",
      " from analysis using the sidebar toggle.</li>",
      "<li>Small samples make trends unstable; interpret statistics as exploratory.</li>",
      "</ul></div>"))
  })

  # ==========================================================================
  # RAW DATA
  # ==========================================================================
  output$raw_table <- renderDT({
    d <- data_f()
    validate(need(nrow(d) > 0, "No data for the current filters."))
    d %>% dplyr::select(-row_id, -reliable_session) %>%
      datatable(rownames = FALSE, filter = "top",
                options = list(pageLength = 15, scrollX = TRUE),
                class = "compact stripe hover")
  })

  output$download_csv <- downloadHandler(
    filename = function() paste0("plr-sessions-filtered-",
                                 format(Sys.time(), "%Y%m%d-%H%M%S"), ".csv"),
    content = function(file) {
      d <- data_f() %>% dplyr::select(-row_id, -reliable_session)
      readr::write_csv(d, file)
    }
  )
}

# =============================================================================
shinyApp(ui, server)
