# ULT Concept AI - Full Stack Startup
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ULT Concept AI - Full Stack Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] Docker not found. Install Docker Desktop first." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] pnpm not found. Run: npm install -g pnpm" -ForegroundColor Red
  exit 1
}

$Tailscale = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
  if (Test-Path $Tailscale) {
    $env:PATH = "C:\Program Files\Tailscale;$env:PATH"
  } else {
    Write-Host "[ERROR] Tailscale not found. Install from https://tailscale.com/download" -ForegroundColor Red
    exit 1
  }
}

Write-Host "[1/6] Starting Docker (PostgreSQL + Redis)..." -ForegroundColor Yellow
docker compose up -d

Write-Host "[2/6] Installing dependencies..." -ForegroundColor Yellow
pnpm install

if (-not (Test-Path "apps\api\.env")) {
  Write-Host "[3/6] Creating apps\api\.env from .env.example..." -ForegroundColor Yellow
  Copy-Item ".env.example" "apps\api\.env"
} else {
  Write-Host "[3/6] apps\api\.env already exists" -ForegroundColor Gray
}

if (-not (Test-Path "apps\web\.env.local")) {
  Write-Host "Creating apps\web\.env.local..." -ForegroundColor Yellow
  @"
NEXT_PUBLIC_API_URL=http://localhost:3001
SUVENIR_API_URL=http://localhost:3001
"@ | Set-Content "apps\web\.env.local" -Encoding UTF8
} else {
  Write-Host "apps\web\.env.local already exists" -ForegroundColor Gray
}

Write-Host "[4/6] Prisma generate + db push + migrate + seed..." -ForegroundColor Yellow
pnpm prisma:generate
pnpm prisma:push
pnpm prisma:migrate
pnpm prisma:seed

Write-Host "[5/6] Tailscale funnel on port 3001..." -ForegroundColor Yellow
Write-Host "[6/6] Starting API :3001 + Web :3000 + Tailscale..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Web UI:  http://localhost:3000" -ForegroundColor Green
Write-Host "  API:     http://localhost:3001" -ForegroundColor Green
Write-Host "  Refs:    uploads/public-api-url.txt (Tailscale *.ts.net)" -ForegroundColor Green
Write-Host ""

pnpm dev:all:tailscale
