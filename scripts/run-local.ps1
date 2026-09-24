<#
.SYNOPSIS
  Run the ConveyorWatch app locally (Vite) and/or provision Supabase.

.DESCRIPTION
  Modes:
    Hosted (default)  - Starts `npm run dev` using the hosted project in .env.
    Local             - Requires Docker + Supabase CLI. Starts Supabase, applies
                        migrations, writes .env.local (local keys), serves edge
                        functions, then starts Vite.
  Options:
    -ApplyRemote      - Pushes migrations and deploys edge functions to the hosted
                        project. Requires `supabase login` and a linked project.
    -GeminiApiKey     - Value injected into supabase/functions/.env (Local mode) or
                        set as the GEMINI_API_KEY secret (ApplyRemote mode).
    -ProjectRef       - Project ref to link before ApplyRemote (optional if already linked).

.EXAMPLE
  .\scripts\run-local.ps1                     # hosted mode, just runs Vite
  .\scripts\run-local.ps1 -Mode Local -GeminiApiKey AIza...
  .\scripts\run-local.ps1 -ApplyRemote -GeminiApiKey AIza... -ProjectRef ocmjygvgxnjgmykjupsd
#>
param(
  [ValidateSet("Hosted", "Local")] [string]$Mode = "Hosted",
  [string]$GeminiApiKey = "",
  [switch]$ApplyRemote,
  [string]$ProjectRef = "",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Have-Cmd([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Ensure-SupabaseCli {
  $knownInstall = Join-Path $env:LOCALAPPDATA "supabase-cli\supabase.exe"
  if (-not (Have-Cmd "supabase") -and (Test-Path $knownInstall)) {
    $env:Path = "$env:Path;$env:LOCALAPPDATA\supabase-cli"
  }
  if (Have-Cmd "supabase") { return }
  Write-Host "supabase CLI not found." -ForegroundColor Yellow
  if ($SkipInstall) {
    Write-Host "Install it with:  irm https://get.supabase.com/install.ps1 | iex" -ForegroundColor Cyan
    throw "supabase CLI required."
  }
  Write-Host "Installing supabase CLI (user-level)..."
  Invoke-RestMethod https://get.supabase.com/install.ps1 | Invoke-Expression
}

function Get-JsonVal($obj, [string[]]$names) {
  foreach ($n in $names) {
    $v = $obj.PSObject.Properties[$n]
    if ($v -and $v.Value) { return "$($v.Value)" }
  }
  return ""
}

function Invoke-Vite {
  Write-Host "Starting Vite dev server (http://localhost:8080). Press Ctrl+C to stop." -ForegroundColor Green
  & npm run dev
  exit $LASTEXITCODE
}

# --- Hosted mode: just launch Vite against .env -------------------------------
if ($Mode -eq "Hosted") {
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) {
    throw ".env not found. Copy .env.example (or your Lovable env keys) to .env first."
  }
  Invoke-Vite
}

# --- Local mode: full Supabase stack + functions + Vite -----------------------
if ($Mode -eq "Local") {
  if (-not (Have-Cmd "docker")) {
    Write-Host "Docker Desktop is required for Local mode. Install it from https://www.docker.com/products/docker-desktop/ then start Docker Desktop." -ForegroundColor Yellow
    throw "docker not found."
  }
  Ensure-SupabaseCli

  Write-Host "Starting Supabase local stack..." -ForegroundColor Green
  supabase start
  if ($LASTEXITCODE -ne 0) { throw "supabase start failed." }

  $status = (supabase status --output json | ConvertFrom-Json)
  $apiUrl   = Get-JsonVal $status @("api_url", "API_URL", "rest_url", "REST_URL")
  $anonKey  = Get-JsonVal $status @("anon_key", "ANON_KEY")
  if (-not $apiUrl) { $apiUrl = "http://127.0.0.1:54321" }
  if (-not $anonKey) {
    Write-Host "Could not read local keys from 'supabase status'. Copy them from the output above into .env.local." -ForegroundColor Yellow
  }

  $localEnv = "VITE_SUPABASE_URL=$apiUrl`nVITE_SUPABASE_PUBLISHABLE_KEY=$anonKey`nVITE_SUPABASE_PROJECT_ID=local`n"
  Set-Content -LiteralPath (Join-Path $Root ".env.local") $localEnv -Encoding ascii
  Write-Host ".env.local written with local Supabase keys." -ForegroundColor Green

  if ($GeminiApiKey) {
    $fnEnv = Join-Path $Root "supabase\functions\.env"
    Set-Content -LiteralPath $fnEnv "GEMINI_API_KEY=$GeminiApiKey" -Encoding ascii
    Write-Host "GEMINI_API_KEY written to $fnEnv" -ForegroundColor Green
  }

  Write-Host "Serving edge functions (analyze-machine-data, analyze-chat)..." -ForegroundColor Green
  Start-Process -FilePath (Get-Command supabase).Source -ArgumentList "functions", "serve" -WorkingDirectory $Root -WindowStyle Hidden
  Start-Sleep -Seconds 3

  Invoke-Vite
}

# --- ApplyRemote: push migrations + deploy functions to hosted project ---------
if ($ApplyRemote) {
  Ensure-SupabaseCli
  $loggedIn = supabase projects list 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "supabase login is required. Run: supabase login" -ForegroundColor Yellow
    throw "supabase login required for -ApplyRemote."
  }

  if ($ProjectRef -and -not (Test-Path (Join-Path $Root "supabase\.temp\project-ref"))) {
    Write-Host "Linking project $ProjectRef ..." -ForegroundColor Green
    supabase link --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw "supabase link failed." }
  }

  Write-Host "Applying migrations to the hosted project..." -ForegroundColor Green
  supabase db push
  if ($LASTEXITCODE -ne 0) { throw "db push failed." }

  Write-Host "Deploying edge functions..." -ForegroundColor Green
  supabase functions deploy analyze-machine-data --no-verify-jwt
  supabase functions deploy analyze-chat --no-verify-jwt

  if ($GeminiApiKey) {
    Write-Host "Setting GEMINI_API_KEY secret..." -ForegroundColor Green
    supabase secrets set "GEMINI_API_KEY=$GeminiApiKey"
  }

  Write-Host "Remote provisioning complete." -ForegroundColor Green
  Write-Host "Next: .\scripts\run-local.ps1   (or  npm run local)  " -ForegroundColor Cyan
}