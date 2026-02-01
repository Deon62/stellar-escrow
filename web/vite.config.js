import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    port: 5500,
    strictPort: false,
    proxy: {
      // Proxy RPC requests to bypass CORS
      "/rpc": {
        target: "https://soroban-testnet.stellar.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ""),
        secure: true,
      },
    },
  },
});
