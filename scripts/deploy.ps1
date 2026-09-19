# PowerShell script to deploy Saathi to Google Cloud Run
param (
    [string]$Project = "",
    [string]$Region = "us-central1"
)

Write-Host "=== Deploying Saathi to Google Cloud Run ===" -ForegroundColor Cyan

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "Error: gcloud CLI is not found." -ForegroundColor Red
    Write-Host "Install it with: winget install Google.CloudSDK" -ForegroundColor Yellow
    Write-Host "Or deploy instantly using Google Cloud Shell: https://shell.cloud.google.com" -ForegroundColor Yellow
    exit 1
}

$deployCmd = "gcloud run deploy saathi --source . --region $Region --allow-unauthenticated"
if ($Project) {
    $deployCmd += " --project $Project"
}

Write-Host "Executing: $deployCmd" -ForegroundColor Green
Invoke-Expression $deployCmd
