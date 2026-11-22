param([int]$Rate=20, [int]$Seconds=180, [string]$Label='measured')
. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $RepoRoot
try {
    & node --import tsx scripts/k8s/run-load.mts --rate $Rate --seconds $Seconds --label $Label
    if ($LASTEXITCODE -ne 0) { throw 'Local load test failed; inspect saved evidence' }
} finally { Pop-Location }
