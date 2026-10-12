@echo off
chcp 65001 >nul
title TankWar Dedicated Server
echo ==================================================
echo           TankWar Dedicated Server v0.1.0
echo ==================================================
echo Đang khởi động Server TankWar (Port 8080)...
tankwar-server.exe
pause
