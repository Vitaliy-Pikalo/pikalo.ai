param([switch]$Autoscaling)
. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LocalKubectl -n pikalo get secret answer-secrets -o name
$hpas = Invoke-LocalKubectl -n pikalo get hpa -o name
if (-not $Autoscaling -and $hpas -contains 'horizontalpodautoscaler.autoscaling/answer-api') {
    throw 'HPA is enabled. Use deploy.ps1 -Autoscaling so apply does not reset the replica count.'
}
$manifestPath = if ($Autoscaling) { 'k8s/autoscaling' } else { 'k8s/base' }
Invoke-LocalKubectl apply --dry-run=server -k (Join-Path $RepoRoot $manifestPath)
Invoke-LocalKubectl apply -k (Join-Path $RepoRoot $manifestPath)
Invoke-LocalKubectl -n pikalo rollout status deployment/mcp-calc --timeout=180s
Invoke-LocalKubectl -n pikalo rollout status deployment/answer-api --timeout=180s
Invoke-LocalKubectl -n pikalo get 'deployments,services,pods'
