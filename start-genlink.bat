@echo off
setlocal

title GenLink Dev Server
cd /d "%~dp0"

echo.
echo ========================================
echo   GenLink quick start
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Please install Node.js first, then run this script again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available. Please check your Node.js installation.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Please keep this script in the GenLink project root.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo [INFO] .env was not found. Creating it from .env.example...
    copy ".env.example" ".env" >nul
  ) else (
    echo [WARN] .env was not found, and .env.example is unavailable.
  )
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] Generating Prisma client...
set "PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma"
call npx prisma generate
if errorlevel 1 (
  echo [ERROR] Prisma client generation failed.
  pause
  exit /b 1
)

echo.
echo [INFO] Starting GenLink at http://localhost:3000
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Job -ScriptBlock { for ($i = 0; $i -lt 60; $i++) { try { $client = New-Object Net.Sockets.TcpClient; $client.Connect('127.0.0.1', 3000); $client.Close(); Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Seconds 1 } } } | Out-Null"
call npm run dev

pause
