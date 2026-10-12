@echo off
chcp 65001 >nul
title TankWar Client
echo ==================================================
echo              TankWar Client v0.1.0
echo ==================================================
echo Đang mở cửa sổ trò chơi TankWar...
tankwar-client.exe
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Lỗi] Trò chơi đã dừng lại. Hãy chắc chắn Server đã được bật trước khi mở Game!
    pause
)
