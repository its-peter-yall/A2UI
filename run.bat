@echo off
setlocal enabledelayedexpansion
echo Starting A2UI Server and Client...
echo.

REM Kill any stale server on port 8000
echo Checking for stale server processes on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Killing PID %%a...
    taskkill /PID %%a /F > nul 2>&1
)
timeout /t 1 /nobreak > nul

REM Verify port 8000 is free, otherwise use 8001
set SERVER_PORT=8000
netstat -ano | findstr ":8000" | findstr "LISTENING" > nul 2>&1
if !errorlevel!==0 (
    echo Port 8000 still in use, falling back to 8001...
    set SERVER_PORT=8001
)

REM Start Server in a new window
echo Starting Server (port !SERVER_PORT!)...
start "A2UI Server" cmd /k "server\.venv\Scripts\activate.bat && python -m uvicorn server.main:app --reload --port !SERVER_PORT!"

REM Wait a moment for server to initialize
timeout /t 2 /nobreak > nul

REM Start Client in a new window
echo Starting Client (port 5173)...
start "A2UI Client" cmd /k "cd client && npm run dev"

echo.
echo Both services are starting in separate windows!
echo - Server: http://localhost:!SERVER_PORT!
echo - Client: http://localhost:5173
pause