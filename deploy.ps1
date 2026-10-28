# Deploys the bot to the droplet over SSH and (re)starts it.
#   .\deploy.ps1                 upload code + .env, install deps, register slash commands, restart
#   .\deploy.ps1 -WithData       also upload data/points.db (ONLY for the first deploy: it overwrites the live database)
#   .\deploy.ps1 -Logs           just tail the bot's logs on the droplet
# Needs: the "ctf" alias in ~/.ssh/config pointing at the droplet (HostName = its IP), user "bot".
param([switch]$WithData, [switch]$Logs, [string]$Target = "bot@ctf")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if ($Logs) { ssh $Target "sudo journalctl -u mvp-bot -n 100 -f"; exit }

if (-not (Test-Path ".env")) { Write-Error ".env is missing (copy .env.example and fill DISCORD_TOKEN / CLIENT_ID)" }

Write-Host "==> packing the bot (without node_modules)" -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP "mvp-bot.tgz"
$items = @("package.json", "package-lock.json", "src", "scripts", ".env", ".env.example", "README.md")
if ($WithData) { $items += "data" }
tar -czf $tmp --exclude="data/*.db-*" @items

Write-Host "==> uploading to $Target" -ForegroundColor Cyan
scp -q $tmp "${Target}:/tmp/mvp-bot.tgz"

Write-Host "==> installing and restarting on the droplet" -ForegroundColor Cyan
$remote = @'
set -e
cd /opt/mvp-bot
tar -xzf /tmp/mvp-bot.tgz && rm -f /tmp/mvp-bot.tgz
chmod 600 .env
mkdir -p data
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -2
node --env-file-if-exists=.env src/deploy-commands.js
sudo systemctl restart mvp-bot
sleep 3
sudo systemctl --no-pager --lines=8 status mvp-bot || true
'@
ssh $Target $remote

Write-Host "`nDone. Logs:  .\deploy.ps1 -Logs" -ForegroundColor Green
