. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LocalKubectl -n pikalo get secret answer-secrets -o name
Invoke-LocalKubectl apply --dry-run=server -k (Join-Path $RepoRoot 'k8s/base')
Invoke-LocalKubectl apply -k (Join-Path $RepoRoot 'k8s/base')
Invoke-LocalKubectl -n pikalo rollout status deployment/mcp-calc --timeout=180s
Invoke-LocalKubectl -n pikalo rollout status deployment/answer-api --timeout=180s
Invoke-LocalKubectl -n pikalo get 'deployments,services,pods'
