. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $RepoRoot
try {
    & node --import tsx scripts/k8s/verify-autoscaling.mts
    if ($LASTEXITCODE -ne 0) { throw 'Autoscaling verification failed' }
} finally { Pop-Location }
