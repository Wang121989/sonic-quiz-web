$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$port = 8080
$python = "python"
if (-not (Get-Command $python -ErrorAction SilentlyContinue)) {
  $python = "py"
}

Write-Host "声波闯关网页版：http://localhost:$port" -ForegroundColor Green
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor DarkGray
& $python -m http.server $port
