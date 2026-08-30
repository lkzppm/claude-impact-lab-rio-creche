$ErrorActionPreference = "Continue"
$frontend_path = "c:\Users\Escola\Documents\Projetos\Hackathons\Claude Impact Lab\frontend"

Write-Host "🚀 Iniciando servidor de desenvolvimento..." -ForegroundColor Green
Write-Host "Frontend rodará em: http://localhost:5173" -ForegroundColor Cyan
Write-Host "API remota: http://10.21.150.158:8000/api/v1" -ForegroundColor Cyan
Write-Host ""

while ($true) {
    Set-Location $frontend_path
    npm run dev

    # Se o servidor caiu, aguarda 3 segundos antes de reiniciar
    Write-Host ""
    Write-Host "⚠️  Servidor parou. Reiniciando em 3 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    Write-Host "🔄 Reiniciando..." -ForegroundColor Cyan
}