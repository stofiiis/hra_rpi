# LAN/Internet Racing (Raspberry Pi + Node.js + Socket.IO)

Top‑down multiplayer závody, běží na Raspberry Pi (nebo kdekoliv s Node.js). Funguje na **lokální síti** a dá se snadno vystavit i **na internet**.

## Spuštění na Raspberry Pi
```bash
cd rpi-multiplayer-racing
npm install
npm start
```
Pak otevři v prohlížeči na jiném zařízení:  
`http://<IP_TVÉHO_RPI>:3000` (IP zjistíš `hostname -I`).

## Ovládání
- **PC:** šipky/WASD (↑ plyn, ↓ brzda, ←/→ zatáčení), Space = brzda.
- **Mobil:** virtuální joystick + tlačítka GO/BRK.

## Parametry
- Počet kol do vítězství nastav env proměnnou: `LAPS=5 npm start`

## Jak otevřít hru do internetu
### 1) Přesměrování portu na routeru (port forwarding)
1. Na routeru nastav přesměrování veřejného portu (třeba `80` nebo `3000`) na interní IP a port RPi (`<IP_RPI>:3000`).
2. Ujisti se, že poskytovatel neblokuje porty a že máš veřejnou IP.
3. Potom může kdokoliv otevřít `http://TVOJE_VEREJNA_IP:PORT`.

### 2) Tunel bez veřejné IP (Cloudflare Tunnel)
Na Raspberry Pi:
```bash
# instalace (Debian/Raspberry Pi OS)
curl -fsSL https://pkg.cloudflare.com/install.sh | sudo bash
sudo apt-get install cloudflared -y

# jednorázový tunel na lokální port 3000
cloudflared tunnel --url http://localhost:3000
```
Cloudflared vypíše **https adresu**, kterou můžeš poslat kamarádům. (Server už binduje `0.0.0.0` a má povolené CORS.)

> Alternativa: ngrok / Tailscale Funnel – postup je obdobný.

## Bezpečnostní poznámky
- Server je herní demo – pokud otevíráš do internetu, zvaž obranu (rate-limit, klíč místnosti, proxy s TLS). V kódu je `helmet` + `compression` a CORS povolený pro jednoduché připojení.
- Pro produkční nasazení zvaž reverzní proxy (Nginx/Caddy) s TLS a omezení přístupu.

## Struktura
- `server.js` – herní server, fyzika, kola, checkpointy, přenos stavů.
- `public/index.html`, `public/client.js`, `public/style.css` – klient, plátno s tratí, auta, leaderboard.
- `package.json` – závislosti a start skripty.

Enjoy & GG! 🏁
