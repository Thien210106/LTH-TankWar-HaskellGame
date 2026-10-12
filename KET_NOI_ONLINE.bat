@echo off
chcp 65001 >nul
title TankWar Client - Kết nối Online qua Internet
echo ==================================================
echo       TankWar Client - KẾT NỐI ONLINE / KHÁC MẠNG
echo ==================================================
echo.
echo Nhập địa chỉ IP / Host của máy chủ (Server):
echo (Ví dụ: 192.168.1.15 hoặc 0.tcp.ap.ngrok.io hoặc IP Radmin VPN)
echo (Nếu để trống và nhấn Enter sẽ mặc định kết nối 127.0.0.1)
set /p SERVER_HOST=">> Nhập Host/IP: "
if "%SERVER_HOST%"=="" set SERVER_HOST=127.0.0.1

echo.
echo Nhập cổng (Port) của máy chủ:
echo (Mặc định là 8080, nếu dùng ngrok hãy nhập port ngrok cấp)
set /p SERVER_PORT=">> Nhập Port [8080]: "
if "%SERVER_PORT%"=="" set SERVER_PORT=8080

echo.
echo ==================================================
echo Đang kết nối tới: %SERVER_HOST%:%SERVER_PORT%...
echo ==================================================
tankwar-client.exe --host %SERVER_HOST% --port %SERVER_PORT%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Lỗi] Kết nối thất bại. Hãy kiểm tra lại địa chỉ Host và Port của Server!
    pause
)
