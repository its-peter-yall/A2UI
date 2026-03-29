@echo off
echo Starting A2UI Server and Client...
echo.

REM Start Server in a new window
echo Starting Server (port 8000)...
start "A2UI Server" cmd /k "server\.venv\Scripts\activate.bat && python -m uvicorn server.main:app --reload --port 8000"

REM Wait a moment for server to initialize
timeout /t 2 /nobreak > nul

REM Start Client in a new window
echo Starting Client (port 5173)...
start "A2UI Client" cmd /k "cd client && npm run dev"

echo.
echo Both services are starting in separate windows!
echo - Server: http://localhost:8000
echo - Client: http://localhost:5173
pause