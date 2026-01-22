@echo off
title Crypto Watchlist Scanner
color 0A

echo ========================================
echo   Crypto Watchlist Daily Scanner
echo ========================================
echo.

cd /d "%~dp0"

echo Starting scan...
echo.

node src/discover.js

if errorlevel 1 (
  echo.
  echo ========================================
  echo   Discovery Failed! See errors above.
  echo ========================================
  echo.
  pause
  exit /b 1
)

node src/index.js

if errorlevel 1 (
  echo.
  echo ========================================
  echo   Scan Failed! See errors above.
  echo ========================================
  echo.
  pause
  exit /b 1
)

echo.
echo Running technical sanity check...
echo.
node scripts\\verify_technical_signals.js

if errorlevel 1 (
  echo.
  echo ========================================
  echo   Sanity Check Failed! See errors above.
  echo ========================================
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Scan Complete!
echo ========================================
echo.
echo Reports saved to: reports\
echo.
echo Press any key to open the dashboard...
pause >nul

if exist "reports\\Dashboard.html" (
  start "" "reports\\Dashboard.html"
) else (
  explorer reports
)
