param([switch]$IncludeEvals, [switch]$IncludeLoad)
. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LocalKubectl get nodes
$images = @('pikalo-answer-api:local', 'pikalo-mcp-calc:local')
if ($IncludeEvals) { $images += 'pikalo-evals:local' }
if ($IncludeLoad) { $images += 'pikalo-load:local' }
foreach ($image in $images) {
    & kind load docker-image $image --name $ClusterName
    if ($LASTEXITCODE -ne 0) {
        # Targeted fallback for Docker Desktop's containerd image store.
        $archive = Join-Path $RepoRoot ('work/k8s/' + $image.Replace(':', '-') + '.tar')
        try {
            & docker image save --platform linux/amd64 --output $archive $image
            if ($LASTEXITCODE -ne 0) { throw "Cannot export $image" }
            & kind load image-archive $archive --name $ClusterName
            if ($LASTEXITCODE -ne 0) { throw "Cannot load $image" }
        } finally {
            # The exact archive is inside the repo's scratch directory; no recursive removal.
            if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
        }
    }
}
Invoke-LocalKubectl -n kube-system wait --for=condition=Ready pod --all --timeout=180s
