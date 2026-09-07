@echo off
chcp 65001 > nul
title Pokemon Battle Log - Local Test Server
echo ========================================================
echo   Pokemon Battle Log - ローカルテストサーバー起動
echo ========================================================
echo.
echo ブラウザで以下のURLを開いてください:
echo http://localhost:8000/test/video_test_runner.html
echo.
echo サーバーを終了するにはこのウィンドウを閉じるか Ctrl+C を押してください。
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\serve.ps1" -Port 8000 -Root "%~dp0"
pause
