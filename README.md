# Rihtim

Docker Desktop'a açık kaynak, web tabanlı bir alternatif. Yerel Docker'a olduğu gibi
**WSL içindeki Docker'a da** ekstra port açmadan bağlanabilir.

> Türkçe "rıhtım" = wharf/pier — Docker temasına uygun bir isim.

## Özellikler

- 📊 **Panel**: Motor bilgisi, konteyner/imaj/CPU/bellek özetleri
- 📦 **Konteynerler**: Listeleme, start/stop/restart/pause/kill, silme, prune
- 🖼️ **İmajlar**: Listeleme, `docker pull` (canlı akış), silme
- 💾 **Volume'ler**: Listeleme, oluşturma, silme
- 🌐 **Ağlar**: Listeleme, oluşturma, silme
- 📡 **Canlı loglar** (WebSocket)
- 🔌 **Çoklu bağlam**: Windows npipe, Unix socket, TCP, SSH, **WSL dağıtımı**

### WSL Bağlantısı Nasıl Çalışır?

Rihtim, WSL dağıtımınızın içindeki `/var/run/docker.sock` unix soketine
`wsl.exe -d <distro> -u root socat` ile stdio üzerinden köprü kurar. TCP açmanıza
veya Docker Desktop'a ihtiyacınız yoktur.

Gereksinimler:

1. WSL2 kurulu.
2. Dağıtım içinde Docker Engine kurulu ve çalışıyor:
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io socat
   sudo service docker start
   ```
3. Ayarlar sayfasından **WSL Dağıtımı** türünde bir bağlam ekleyin (`wsl -l -q`
   ile listelenen adı yazın, ör: `Ubuntu`).

## Mimari

```
apps/
  api/    # Fastify + dockerode (Node.js)  — port 4317
  web/    # Next.js 14 + Tailwind          — port 3000
packages/
  shared/ # Ortak TypeScript tipleri
```

Web `/api/*` isteklerini Next.js rewrites üzerinden API'ye proxy'ler.

## Kurulum

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Geliştirme

Aynı anda API + Web:

```bash
pnpm dev
```

- API: http://127.0.0.1:5170
- Web: http://localhost:3030

## Üretim

```bash
pnpm build
pnpm start
```

## Yol Haritası

- [ ] Interaktif exec (xterm.js + WS)
- [ ] Konteyner stats grafik (canlı)
- [ ] Docker Compose (yaml deploy / down)
- [ ] Docker Hub arama + login
- [ ] Container oluşturma sihirbazı (port/env/mount UI)
- [ ] Kubernetes bağlamı
- [ ] Extension SDK
- [ ] Tauri / Electron ile masaüstü paketi
