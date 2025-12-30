@echo off
title DeFi Protocol Scanner
color 0E

echo ========================================
echo   DeFi Protocol Scanner (ETH + SOL)
echo ========================================
echo.

cd /d "%~dp0"

echo Starting scan...
echo.

node src/defi_scan.js

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
echo ========================================
echo   Scan Complete!
echo ========================================
echo.
echo Latest report: reports\defi\Latest.md
echo.
echo Press any key to open the DeFi reports folder...
pause >nul

explorer reports\defi

