@echo off
setlocal enabledelayedexpansion
echo Starting A2UI Server and Client...
echo.

REM Check if port 8000 is already in use
netstat -ano | findstr ":8000" | findstr "LISTENING" > nul 2>&1
if !errorlevel!==0 (
    echo ERROR: Port 8000 is already in use.
    echo        Please stop the process using port 8000 and try again.
    echo        You can find it with: netstat -ano ^| findstr ":8000"
    exit /b 1
)

REM Start Server in a new window
echo Starting Server (port 8000)...
start "A2UI Server" cmd /k "cd /d %~dp0 && .venv\Scripts\activate && python -m uvicorn server.main:app --reload --port 8000"
REM Wait a moment for server to initialize
timeout /t 2 /nobreak > nul

REM Start Client in a new window
echo Starting Client (port 5173)...
start "A2UI Client" cmd /k "cd client && npm run dev"

echo.
echo Both services are starting in separate windows!
echo - Server: http://localhost:8000
echo - Client: http://localhost:5173
exit