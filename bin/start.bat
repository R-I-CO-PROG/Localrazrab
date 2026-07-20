@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

echo ========================================
echo  ULT Concept AI - Full Stack Startup
echo ========================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker not found. Install Docker Desktop first.
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm not found. Run: npm install -g pnpm
  pause
  exit /b 1
)

set "TAILSCALE_BIN="
where tailscale >nul 2>&1
if not errorlevel 1 (
  set "TAILSCALE_BIN=tailscale"
) else if exist "C:\Program Files\Tailscale\tailscale.exe" (
  set "TAILSCALE_BIN=C:\Program Files\Tailscale\tailscale.exe"
  set "PATH=C:\Program Files\Tailscale;%PATH%"
)

if not defined TAILSCALE_BIN (
  echo [ERROR] Tailscale not found. Install from https://tailscale.com/download
  pause
  exit /b 1
)

echo [1/6] Starting Docker (PostgreSQL + Redis)...
docker compose up -d
if errorlevel 1 (
  echo [ERROR] Docker compose failed
  pause
  exit /b 1
)

echo [2/6] Installing dependencies...
call pnpm install
if errorlevel 1 (
  echo [ERROR] pnpm install failed
  pause
  exit /b 1
)

if not exist "apps\api\.env" (
  echo [3/6] Creating apps\api\.env from .env.example...
  copy /Y ".env.example" "apps\api\.env" >nul
) else (
  echo [3/6] apps\api\.env already exists
)

if not exist "apps\web\.env.local" (
  echo Creating apps\web\.env.local...
  echo NEXT_PUBLIC_API_URL=http://localhost:3001> "apps\web\.env.local"
  echo SUVENIR_API_URL=http://localhost:3001>> "apps\web\.env.local"
) else (
  echo apps\web\.env.local already exists
)

echo [4/6] Prisma generate + db push + migrate + seed...
call pnpm prisma:generate
if errorlevel 1 (
  echo [ERROR] prisma generate failed
  pause
  exit /b 1
)
call pnpm prisma:push
if errorlevel 1 (
  echo [ERROR] prisma db push failed
  pause
  exit /b 1
)
call pnpm prisma:migrate
call pnpm prisma:seed

echo [5/6] Tailscale funnel on port 3001...
echo.

echo [6/6] Starting API :3001 + Web :3000 + Tailscale...
echo.
echo   Web UI:  http://localhost:3000
echo   API:     http://localhost:3001
echo   Refs:    uploads/public-api-url.txt (Tailscale *.ts.net)
echo.
if exist "apps\web\.next" (
  echo Clearing stale Next.js cache...
  rmdir /s /q "apps\web\.next" 2>nul
)
call pnpm dev:all:tailscale

pause
