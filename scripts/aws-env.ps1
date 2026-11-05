# Dot-source from the repo root before any AWS/CDK command:
#   . .\scripts\aws-env.ps1
# Clears stale exported credentials (they shadow a valid `aws login`
# session), signs in again if needed, and exports fresh ones for CDK.

Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
$env:AWS_REGION = "us-east-2"

$account = aws sts get-caller-identity --query Account --output text 2>$null
if (-not $account) {
  Write-Host "AWS session expired. Signing in..." -ForegroundColor Yellow
  aws login
  $account = aws sts get-caller-identity --query Account --output text
}
aws configure export-credentials --format powershell | Invoke-Expression
Write-Host "AWS ready: account $account, region $env:AWS_REGION" -ForegroundColor Green
