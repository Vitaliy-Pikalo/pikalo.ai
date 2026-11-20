. (Join-Path $PSScriptRoot 'common.ps1')
& kind delete cluster --name $ClusterName --kubeconfig $Kubeconfig
if ($LASTEXITCODE -ne 0) { throw 'Cluster teardown failed' }
# kind owns its shared Docker network; remove it only if no containers use it.
$networks = & docker network ls --filter name=^kind$ --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect kind network' }
if ($networks -contains 'kind') {
    $network = (& docker network inspect kind | ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect kind network' }
    if (@($network.Containers.PSObject.Properties).Count -eq 0) {
        & docker network rm kind
        if ($LASTEXITCODE -ne 0) { throw 'Cannot remove unused kind network' }
    }
}
