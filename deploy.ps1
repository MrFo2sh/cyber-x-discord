# Deploys / updates the bot on the droplet over SSH.
#   .\deploy.ps1                 upload .env, pull the latest code from GitHub, install deps, register slash commands, restart
#   .\deploy.ps1 -WithData       also upload data/points.db (ONLY for the first deploy: it overwrites the live database)
#   .\deploy.ps1 -Logs           just follow the bot's logs on the droplet
#   .\deploy.ps1 -Status         show whether the bot is running
# Needs: the "ctf" alias in ~/.ssh/config pointing at the droplet (HostName = its IP), user "bot".
param([switch]$WithData, [switch]$Logs, [switch]$Status, [string]$Target = "bot@ctf")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if ($Logs) { ssh $Target "sudo journalctl -u mvp-bot -n 100 -f"; exit }
if ($Status) { ssh $Target "sudo systemctl --no-pager status mvp-bot; echo; node --version"; exit }

if (-not (Test-Path ".env")) { Write-Error ".env is missing (copy .env.example and fill DISCORD_TOKEN / CLIENT_ID)" }

Write-Host "==> uploading .env$(if ($WithData) { ' + data/points.db' })" -ForegroundColor Cyan
scp -q .env "${Target}:/opt/mvp-bot/.env"
if ($WithData) { scp -q data\points.db "${Target}:/opt/mvp-bot/data/points.db" }

Write-Host "==> updating code from GitHub and restarting on the droplet" -ForegroundColor Cyan
$remote = @'
set -e
cd /opt/mvp-bot
chmod 600 .env
git pull --ff-only 2>&1 | tail -1
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -1
node --env-file-if-exists=.env src/deploy-commands.js
sudo systemctl restart mvp-bot
sleep 3
sudo systemctl --no-pager --lines=8 status mvp-bot || true
'@
ssh $Target $remote

Write-Host "`nDone. Logs:  .\deploy.ps1 -Logs" -ForegroundColor Green
