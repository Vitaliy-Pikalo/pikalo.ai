param([switch]$Fixture)
. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LocalKubectl apply -f (Join-Path $RepoRoot 'k8s/base/namespace.yaml')
if ($Fixture) {
    $values = @{ SUPABASE_PUBLISHABLE_KEY = 'fixture'; EMBED_SIGNING_SECRET = 'fixture' }
} else {
    $values = @{}
    foreach ($name in @('SUPABASE_PUBLISHABLE_KEY', 'EMBED_SIGNING_SECRET')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ([string]::IsNullOrWhiteSpace($value)) { throw "Missing environment variable: $name" }
        $values[$name] = $value
    }
}
$secret = @{
    apiVersion = 'v1'; kind = 'Secret'; type = 'Opaque'
    metadata = @{ name = 'answer-secrets'; namespace = 'pikalo' }
    stringData = $values
}
# Values go over stdin, not command-line arguments, a saved manifest, or stdout.
$secret | ConvertTo-Json -Depth 5 -Compress | & kubectl --kubeconfig $Kubeconfig --context $KubeContext apply --server-side -f -
if ($LASTEXITCODE -ne 0) { throw 'Secret creation failed' }
