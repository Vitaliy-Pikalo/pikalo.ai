. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LocalKubectl apply --dry-run=server -k (Join-Path $RepoRoot 'k8s/metrics-server')
Invoke-LocalKubectl apply -k (Join-Path $RepoRoot 'k8s/metrics-server')
Invoke-LocalKubectl -n kube-system rollout status deployment/metrics-server --timeout=180s
Invoke-LocalKubectl wait --for=condition=Available apiservice/v1beta1.metrics.k8s.io --timeout=180s
& (Join-Path $PSScriptRoot 'deploy.ps1') -Autoscaling
if ($LASTEXITCODE -ne 0) { throw 'Autoscaling deployment failed' }
Invoke-LocalKubectl -n pikalo get hpa
