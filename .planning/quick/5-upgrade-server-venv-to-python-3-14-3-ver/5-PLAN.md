---
phase: 5-upgrade-server-venv-to-python-3-14-3-ver
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/.venv
autonomous: true
must_haves:
  truths:
    - Python 3.14.3 is used in the virtual environment
    - All dependencies from requirements.txt are installed
    - Server can import installed packages without errors
  artifacts:
    - path: server/.venv
      provides: "Python 3.14.3 virtual environment with all dependencies"
    - path: server/requirements.txt
      provides: "Dependency manifest (already exists)"
  key_links:
    - from: server/requirements.txt
      to: server/.venv
      via: pip install -r requirements.txt
---

<objective>
Upgrade the server virtual environment from current Python version to Python 3.14.3, ensuring all dependencies are properly reinstalled and functional.

Purpose: Keep the development environment up-to-date with the latest Python version while maintaining all required packages.
Output: Fully functional server/.venv running Python 3.14.3 with all dependencies installed.
</objective>

<execution_context>
@C:/Users/Peter/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@server/requirements.txt
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify prerequisites and backup check</name>
  <files>server/requirements.txt</files>
  <action>
    1. Verify server/requirements.txt exists and contains required packages (fastapi, uvicorn[standard], google-cloud-aiplatform, python-dotenv, pydantic, instructor, tenacity, jsonref).
    2. Check Python 3.14.3 is installed on system by running `python3.14 --version` or `py -3.14 --version`.
    3. Note current working state before any changes.
  </action>
  <verify>Python 3.14.x is available on system (may be `python3.14`, `py -3.14`, or similar command)</verify>
  <done>Requirements file verified and Python 3.14.3 confirmed available</done>
</task>

<task type="auto">
  <name>Task 2: Delete old virtual environment</name>
  <files>server/.venv</files>
  <action>
    1. Delete the existing server/.venv directory completely.
    2. Verify directory no longer exists.
  </action>
  <verify>`ls server/.venv` returns "No such file or directory" or equivalent</verify>
  <done>Old virtual environment completely removed</done>
</task>

<task type="auto">
  <name>Task 3: Create new virtual environment and install dependencies</name>
  <files>server/.venv</files>
  <action>
    1. Create new virtual environment with Python 3.14.3:
       - Windows: `python3.14 -m venv server/.venv` or `py -3.14 -m venv server/.venv`
       - If python3.14 not available, try: `python -m venv server/.venv --python=3.14` or locate Python 3.14 executable
    2. Activate the virtual environment:
       - Windows PowerShell: `server/.venv\Scripts\Activate.ps1`
       - Windows CMD: `server\.venv\Scripts\activate.bat`
    3. Install dependencies: `pip install -r server/requirements.txt`
    4. Verify installation by importing key packages:
       - `python -c "import fastapi; print(fastapi.__version__)"`
       - `python -c "import pydantic; print(pydantic.__version__)"`
       - `python -c "import uvicorn; print(uvicorn.__version__)"`
       - `python -c "import google.cloud.aiplatform"` (may require auth, just check import works)
    5. Verify Python version in venv: `python --version` should show 3.14.3
  </action>
  <verify>All imports succeed without errors and Python version is 3.14.3</verify>
  <done>Virtual environment created with Python 3.14.3 and all dependencies installed successfully</done>
</task>

</tasks>

<verification>
- Run `server/.venv\Scripts\python.exe --version` and confirm output is Python 3.14.3
- Run `server/.venv\Scripts\python.exe -c "import fastapi, uvicorn, pydantic; print('All imports successful')"`
- Check pip list shows all required packages: fastapi, uvicorn[standard], google-cloud-aiplatform, python-dotenv, pydantic, instructor, tenacity, jsonref
</verification>

<success_criteria>
- Virtual environment exists at server/.venv with Python 3.14.3
- All 8 dependencies from requirements.txt are installed and importable
- Python version check confirms 3.14.3 in the virtual environment
</success_criteria>

<output>
After completion, create `.planning/quick/5-upgrade-server-venv-to-python-3-14-3-ver/5-01-SUMMARY.md`
</output>
