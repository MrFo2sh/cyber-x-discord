# Hosting the bot on a DigitalOcean droplet

## 1. Create the droplet

- Image: **Ubuntu 24.04 LTS**. Size: the smallest one is enough (the bot idles at ~60 MB).
- Authentication: **SSH key**, pick the key `m.fouad2912@gmail.com` (public key in `C:\Users\11\.ssh\id_ed25519.pub`).
- Additional Options → tick **Startup scripts** and paste the whole content of `deploy/cloud-init.yaml`.
- Create. The first boot takes 2-3 minutes: it installs Node 24, opens only SSH in the firewall,
  disables password logins, clones https://github.com/MrFo2sh/cyber-x-discord into `/opt/mvp-bot`,
  installs the dependencies and prepares the `mvp-bot` service. The only thing missing afterwards
  is `.env` (the bot token), which the deploy script uploads.

## 2. Point the SSH alias at it

Edit `C:\Users\11\.ssh\config`, replace `DROPLET_IP` with the droplet's IP and set the user:

```
Host ctf
  HostName <droplet ip>
  User bot
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Test: `ssh ctf` then `cat /root/cloud-init-done.txt` (as `sudo cat ...`) shows the Node version once the startup script finished.

## 3. Deploy

From `D:\discord-bots` in PowerShell:

```
.\deploy.ps1 -WithData     # first time: code + .env + the existing points database
.\deploy.ps1               # every later change: code + .env only (the live database is kept)
.\deploy.ps1 -Logs         # watch the bot's logs
```

The deploy uploads `.env`, pulls the latest code from GitHub on the droplet, runs `npm ci`,
registers the slash commands, and restarts the service. So the routine is: push to GitHub, then
`.\deploy.ps1`. The bot restarts by itself after a crash or a reboot.

## Useful commands on the droplet

```
sudo systemctl status mvp-bot          # running?
sudo journalctl -u mvp-bot -f          # live logs
sudo systemctl restart mvp-bot
sqlite3 /opt/mvp-bot/data/points.db    # (apt install sqlite3) poke at the database
```

Backups: `scp ctf:/opt/mvp-bot/data/points.db .\data\points.backup.db` from your PC.
