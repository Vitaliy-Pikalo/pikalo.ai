$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$ClusterName = 'pikalo-local'
$KubeContext = 'kind-pikalo-local'
$Kubeconfig = Join-Path $RepoRoot 'work/k8s/kubeconfig'
# Refresh PATH for tools installed during this session.
if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
    $env:PATH = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:PATH
}

function Invoke-LocalKubectl {
    & kubectl --kubeconfig $Kubeconfig --context $KubeContext @args
    if ($LASTEXITCODE -ne 0) { throw "kubectl failed: $($args[0])" }
}
