@echo off
chcp 65001 > nul
title Pokemon Showdown Data Sync
echo ========================================================
echo   Pokemon Showdown データの同期を開始します...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync_data.ps1"

echo.
echo ========================================================
echo   完了しました。キーを押して閉じてください。
echo ========================================================
pause > nul
