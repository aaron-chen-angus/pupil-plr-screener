<#
=============================================================================
 PLR Screener - Synthetic data seeder (PowerShell)
=============================================================================

 Generates physiologically-plausible synthetic PLR sessions and POSTs them to
 the same Google Apps Script Web App the web app uses, so they appear in the
 Google Sheet and flow into the dashboard.

 >>> SYNTHETIC TEST DATA ONLY. Not real patients. For exercising the
     visualisations. Every generated name is fictional. <<<

 The cohort model is grounded in PLR physiology so the visualisations show
 meaningful structure:

   * Healthy            - brisk, symmetric reflex, low asymmetry.
   * Global reduced     - both eyes sluggish but symmetric (e.g. ageing /
                          diffuse autonomic change).
   * Unilateral (RAPD)  - one eye markedly worse -> high interocular asymmetry,
                          "asymmetric" indicator.
   * Severe             - very sluggish, both eyes, some unreliable.
   * Low-quality        - noisy / unreliable / insufficient runs.

 Also models age effects: older subjects have slightly smaller baseline pupils
 ("senile miosis") and a mild reduction in constriction amplitude.

 -----------------------------------------------------------------------------
 HOW TO RUN (from this folder), in PowerShell:

   ./seed-synthetic-data.ps1                 # posts 60 sessions
   ./seed-synthetic-data.ps1 -Count 30       # posts 30
   ./seed-synthetic-data.ps1 -DelayMs 400    # slower, gentler on Apps Script
   ./seed-synthetic-data.ps1 -DryRun         # print rows, do NOT post

 The Web App URL below matches app/config.js. Change it if you re-deploy.
=============================================================================
#>

param(
  [int]$Count = 60,
  [int]$DelayMs = 250,
  [switch]$DryRun,
  [string]$WebAppUrl = "https://script.google.com/macros/s/AKfycbzO4xK7Op1zZrf4b1XI3KhrjicLUgqTjkV24mWGceL8QGz32Q3gK2Qpb5wLa9dbTceKYA/exec"
)

# Deterministic-ish but varied each run.
$rng = [System.Random]::new()

function RandUniform([double]$min, [double]$max) {
  return $min + ($rng.NextDouble() * ($max - $min))
}

# Approx normal via Box-Muller, clamped to a sensible range.
function RandNormal([double]$mean, [double]$sd, [double]$lo, [double]$hi) {
  $u1 = [Math]::Max($rng.NextDouble(), 1e-9)
  $u2 = $rng.NextDouble()
  $z  = [Math]::Sqrt(-2.0 * [Math]::Log($u1)) * [Math]::Cos(2.0 * [Math]::PI * $u2)
  $v  = $mean + ($z * $sd)
  if ($v -lt $lo) { $v = $lo }
  if ($v -gt $hi) { $v = $hi }
  return $v
}

function Round3([double]$v) { return [Math]::Round($v, 3) }

$FirstNames = @("Aisha","Ben","Chloe","Daniel","Ethan","Farah","Grace","Hui","Ian",
  "Jia","Kavya","Liam","Mei","Nadia","Omar","Priya","Qi","Rahul","Sofia","Tariq",
  "Uma","Victor","Wei","Xin","Yara","Zack","Aaron","Bella","Caleb","Divya")
$LastNames = @("Tan","Lim","Wong","Kumar","Chen","Ng","Rahman","Lee","Goh","Sharma",
  "Ong","Nair","Teo","Das","Koh","Balan","Yeo","Raj","Sim","Low")

function RandomName() {
  $f = $FirstNames[$rng.Next($FirstNames.Count)]
  $l = $LastNames[$rng.Next($LastNames.Count)]
  return "$f $l"
}

# Weighted cohort picker.
function PickCohort() {
  $r = $rng.NextDouble()
  if ($r -lt 0.45) { return "healthy" }
  elseif ($r -lt 0.65) { return "global_reduced" }
  elseif ($r -lt 0.85) { return "unilateral" }
  elseif ($r -lt 0.95) { return "severe" }
  else { return "low_quality" }
}

# Build one eye's metrics from a target "reflex strength" profile.
#   baseline mm, and quality of reflex drive constriction/latency/velocity.
function MakeEye([double]$baseline, [string]$strength) {
  switch ($strength) {
    "brisk"    { $pct = RandNormal 38 5   22 55;  $lat = RandNormal 240 25 180 320; $mv = RandNormal 3.4 0.5 2.2 4.8 }
    "reduced"  { $pct = RandNormal 23 4   12 32;  $lat = RandNormal 310 30 250 400; $mv = RandNormal 1.9 0.4 1.0 3.0 }
    "poor"     { $pct = RandNormal 12 3   4  20;  $lat = RandNormal 380 40 300 480; $mv = RandNormal 1.1 0.3 0.4 1.9 }
    "affected" { $pct = RandNormal 8  3   2  16;  $lat = RandNormal 420 45 320 520; $mv = RandNormal 0.8 0.25 0.3 1.5 }
    default    { $pct = RandNormal 30 6   10 50;  $lat = RandNormal 270 35 180 400; $mv = RandNormal 2.6 0.6 1.2 4.0 }
  }
  $minMm = $baseline * (1.0 - ($pct / 100.0))
  if ($minMm -lt 1.2) { $minMm = 1.2 }
  # Peak velocity is a bit higher than mean.
  $maxV = $mv * (RandUniform 1.25 1.7)
  return [ordered]@{
    baselineMm         = Round3 $baseline
    minMm              = Round3 $minMm
    percentConstriction= Round3 $pct
    latencyMs          = [Math]::Round($lat)
    meanVelocity       = Round3 $mv
    maxVelocity        = Round3 $maxV
  }
}

# Generate one full session record matching app/sheets.js buildSheetRow order.
function MakeSession([int]$index) {
  $cohort = PickCohort

  # Age: broad spread, slightly older on average to exercise the age trend.
  $age = [Math]::Round((RandNormal 45 18 6 92))
  # Baseline pupil shrinks a little with age (senile miosis): ~ -0.015 mm/yr from a ~6.2 mm young baseline.
  $baseYoung = RandNormal 6.2 0.5 4.6 7.6
  $baseline  = [Math]::Max(3.2, $baseYoung - (($age - 20) * 0.015))

  # Weight towards female/male, with a few other / prefer-not-to-say.
  $gr = $rng.NextDouble()
  if     ($gr -lt 0.45) { $gender = "female" }
  elseif ($gr -lt 0.88) { $gender = "male" }
  elseif ($gr -lt 0.95) { $gender = "other" }
  else                  { $gender = "prefer_not_to_say" }

  $unreliable = $false
  $stimulusDelivered = $true

  switch ($cohort) {
    "healthy" {
      $rEye = MakeEye $baseline "brisk"
      $lEye = MakeEye $baseline "brisk"
    }
    "global_reduced" {
      $rEye = MakeEye $baseline "reduced"
      $lEye = MakeEye $baseline "reduced"
    }
    "unilateral" {
      # One randomly-chosen eye is affected (RAPD-like afferent defect); the
      # other stays brisk -> large interocular asymmetry.
      if ($rng.NextDouble() -lt 0.5) {
        $rEye = MakeEye $baseline "affected"
        $lEye = MakeEye $baseline "brisk"
      } else {
        $rEye = MakeEye $baseline "brisk"
        $lEye = MakeEye $baseline "affected"
      }
    }
    "severe" {
      $rEye = MakeEye $baseline "poor"
      $lEye = MakeEye $baseline "poor"
      if ($rng.NextDouble() -lt 0.4) { $unreliable = $true }
    }
    "low_quality" {
      $rEye = MakeEye $baseline "default"
      $lEye = MakeEye $baseline "default"
      $unreliable = $true
      if ($rng.NextDouble() -lt 0.5) { $stimulusDelivered = $false }  # demo/no-stimulus run
    }
  }

  # Composite asymmetry score = |dPct| + 10 * |dVelocity|  (matches the app).
  $dPct = [Math]::Abs($rEye.percentConstriction - $lEye.percentConstriction)
  $dVel = [Math]::Abs($rEye.meanVelocity - $lEye.meanVelocity)
  $score = $dPct + (10.0 * $dVel)
  $threshold = 20

  if ($unreliable -or -not $stimulusDelivered) {
    $indicator = "insufficient"
  } elseif ($score -ge $threshold) {
    $indicator = "asymmetric"
  } else {
    $indicator = "symmetric"
  }

  # Per-eye reliability: false for the low-quality cohort / occasionally poor runs.
  $rReliable = -not $unreliable
  $lReliable = -not $unreliable

  # Timestamps: spread the sessions across roughly the last 21 days.
  $daysAgo   = RandUniform 0 21
  $ts        = (Get-Date).ToUniversalTime().AddDays(-$daysAgo)
  $iso       = $ts.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  # createdAt a few seconds after the test started.
  $createdIso= $ts.AddSeconds((RandUniform 15 40)).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

  # Ordered to mirror app/sheets.js buildSheetRow (the Apps Script maps by key,
  # so order is not strictly required, but we keep it identical for clarity).
  return [ordered]@{
    name               = RandomName
    age                = $age
    gender             = $gender
    testTakenAt        = $iso
    createdAt          = $createdIso
    appVersion         = "1.0.0-synthetic"
    stimulusDelivered  = $stimulusDelivered
    indicator          = $indicator
    asymmetryScore     = Round3 $score
    asymmetryThreshold = $threshold
    unreliable         = $unreliable
    right_baselineMm          = $rEye.baselineMm
    right_minMm               = $rEye.minMm
    right_percentConstriction = $rEye.percentConstriction
    right_latencyMs           = $rEye.latencyMs
    right_meanVelocity        = $rEye.meanVelocity
    right_maxVelocity         = $rEye.maxVelocity
    right_reliable            = $rReliable
    left_baselineMm           = $lEye.baselineMm
    left_minMm                = $lEye.minMm
    left_percentConstriction  = $lEye.percentConstriction
    left_latencyMs            = $lEye.latencyMs
    left_meanVelocity         = $lEye.meanVelocity
    left_maxVelocity          = $lEye.maxVelocity
    left_reliable             = $lReliable
  }
}

Write-Host "PLR synthetic seeder" -ForegroundColor Cyan
Write-Host ("Generating {0} sessions{1}..." -f $Count, $(if ($DryRun) {" (DRY RUN - not posting)"} else {""}))

$ok = 0; $fail = 0
$summary = @{}

for ($i = 1; $i -le $Count; $i++) {
  $row  = MakeSession $i
  $json = $row | ConvertTo-Json -Compress

  $summary[$row.indicator] = 1 + ($summary[$row.indicator])

  if ($DryRun) {
    Write-Host $json
    continue
  }

  try {
    # Content-Type text/plain matches the web app -> Apps Script parses JSON.parse.
    Invoke-RestMethod -Uri $WebAppUrl -Method Post -Body $json `
      -ContentType "text/plain;charset=utf-8" -TimeoutSec 30 | Out-Null
    $ok++
    Write-Host ("  [{0,2}/{1}] posted - {2}, {3}, age {4}" -f $i, $Count, $row.indicator, $row.gender, $row.age) -ForegroundColor Green
  } catch {
    $fail++
    Write-Host ("  [{0,2}/{1}] FAILED - {2}" -f $i, $Count, $_.Exception.Message) -ForegroundColor Red
  }

  if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
}

Write-Host ""
Write-Host "Indicator mix generated:" -ForegroundColor Cyan
$summary.GetEnumerator() | Sort-Object Name | ForEach-Object {
  Write-Host ("  {0,-13} {1}" -f $_.Key, $_.Value)
}

if (-not $DryRun) {
  Write-Host ""
  Write-Host ("Done. Posted OK: {0}   Failed: {1}" -f $ok, $fail) -ForegroundColor Cyan
  Write-Host "Open the Google Sheet / dashboard to confirm the new rows." -ForegroundColor Yellow
}
