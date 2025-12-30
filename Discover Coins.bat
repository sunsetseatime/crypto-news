@echo off
title Coin Discovery
color 0B

echo ========================================
echo   Coin Discovery Tool
echo ========================================
echo.

cd /d "%~dp0"

echo Finding trending and new coins...
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

echo.
echo ========================================
echo   Discovery Complete!
echo ========================================
echo.
echo Reports saved to: reports\
echo.
echo Next:
echo   node src\promote_discovery.js list
echo   node src\promote_discovery.js stage ^<coingecko-id^>
echo.
pause

