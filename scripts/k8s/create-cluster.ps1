. (Join-Path $PSScriptRoot 'common.ps1')
$clusters = & kind get clusters
if ($LASTEXITCODE -ne 0) { throw 'Cannot list kind clusters' }
if ($clusters -contains $ClusterName) { throw 'pikalo-local already exists. Reuse it or run teardown.ps1 first.' }
New-Item -ItemType Directory -Force -Path (Split-Path $Kubeconfig) | Out-Null
& kind create cluster --config (Join-Path $RepoRoot 'k8s/kind.yaml') --kubeconfig $Kubeconfig --wait 180s
if ($LASTEXITCODE -ne 0) { throw 'Cluster creation failed' }
Invoke-LocalKubectl get nodes
