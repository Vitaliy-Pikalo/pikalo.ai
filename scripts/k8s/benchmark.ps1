param([int]$Rate=20, [int]$Seconds=180)
. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'create-cluster.ps1')
try {
    & (Join-Path $PSScriptRoot 'load-images.ps1') -IncludeEvals -IncludeLoad
    & (Join-Path $PSScriptRoot 'create-local-secret.ps1') -Fixture
    & (Join-Path $PSScriptRoot 'deploy.ps1')
    & (Join-Path $PSScriptRoot 'run-evals.ps1')
    & (Join-Path $PSScriptRoot 'enable-autoscaling.ps1')
    Invoke-LocalKubectl apply --dry-run=server -k (Join-Path $RepoRoot 'k8s/load')
    Invoke-LocalKubectl apply -k (Join-Path $RepoRoot 'k8s/load')
    Invoke-LocalKubectl -n pikalo rollout status deployment/fixture-backend --timeout=180s
    Invoke-LocalKubectl -n pikalo rollout status deployment/answer-api --timeout=180s
    & (Join-Path $PSScriptRoot 'run-load.ps1') -Rate 1 -Seconds 10 -Label smoke
    & (Join-Path $PSScriptRoot 'run-load.ps1') -Rate $Rate -Seconds $Seconds -Label measured
} finally {
    & (Join-Path $PSScriptRoot 'teardown.ps1')
}
