Set-Location $PSScriptRoot\backend

$python = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

Write-Host "Bagimliliklar kontrol ediliyor..." -ForegroundColor DarkGray
& $python -m pip install -q -r ..\requirements.txt

Write-Host "Backend baslatiliyor: http://127.0.0.1:5000" -ForegroundColor Cyan
& $python app.py
