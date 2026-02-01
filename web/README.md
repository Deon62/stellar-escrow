# Lumenswags Web UI

The Stellar SDK is **bundled with the app** (no CDN). Run:

```bash
cd web
npm install
npm run dev
```

Then open **http://localhost:5500** (Vite is set to port 5500; stop Live Server first if it’s using that port). The SDK is bundled, so there’s no CDN or CORS.

- **Build for production:** `npm run build` → output in `dist/`
- **Preview production build:** `npm run preview`
