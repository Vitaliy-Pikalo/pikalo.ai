param([switch]$NegativeControl)
. (Join-Path $PSScriptRoot 'common.ps1')
Push-Location $RepoRoot
try {
    $evalArgs = @('--import', 'tsx', 'scripts/k8s/run-evals.mts')
    if ($NegativeControl) { $evalArgs += '--negative-control' }
    & node @evalArgs
    if ($LASTEXITCODE -ne 0) { throw 'Kubernetes eval Job gate failed' }
} finally { Pop-Location }
