# Starts the API and the web app together, and stops both on Ctrl-C.
# PowerShell equivalent of start.sh. Run it with:
#   .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error @"
uv is not installed. Install it with:
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
Then open a new terminal so PATH picks it up.
"@
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Get it from https://nodejs.org (LTS)."
    exit 1
}

# uv sync is quick when nothing has changed, so it is safe to run every time.
# It also installs the right Python if the pinned version is missing.
Push-Location backend
uv sync --quiet
Pop-Location

if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "Installing web dependencies..."
    Push-Location frontend
    npm install
    Pop-Location
}

$api = $null
$web = $null

try {
    $api = Start-Process -FilePath "uv" `
        -ArgumentList "run", "uvicorn", "app.main:app", "--reload", "--port", "8000" `
        -WorkingDirectory (Join-Path $PSScriptRoot "backend") -NoNewWindow -PassThru

    $web = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory (Join-Path $PSScriptRoot "frontend") -NoNewWindow -PassThru

    Write-Host ""
    Write-Host "  API  http://localhost:8000/docs"
    Write-Host "  App  http://localhost:5173"
    Write-Host ""
    Write-Host "  Press Ctrl-C to stop both."
    Write-Host ""

    # Wait for either process to exit, so Ctrl-C reaches the finally block.
    while (-not $api.HasExited -and -not $web.HasExited) {
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($p in @($api, $web)) {
        if ($p -and -not $p.HasExited) {
            # Kill the whole tree: npm and uv each spawn the real server.
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            Get-CimInstance Win32_Process -Filter "ParentProcessId = $($p.Id)" `
                -ErrorAction SilentlyContinue |
                ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        }
    }
    Write-Host "Stopped."
}
