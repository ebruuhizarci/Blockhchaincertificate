Set-Location $PSScriptRoot\backend
Write-Host "Backend baslatiliyor: http://127.0.0.1:5000" -ForegroundColor Cyan
python app.py
