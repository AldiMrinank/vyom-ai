import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: { host: "::", port: 8080, hmr: { overlay: false } },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react","react-dom","react/jsx-runtime","react/jsx-dev-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react","react-dom","react-router-dom"],
          "vendor-firebase": ["firebase/app","firebase/auth","firebase/firestore"],
          "vendor-markdown": ["react-markdown","remark-gfm","react-syntax-highlighter"],
          "vendor-ui": ["@radix-ui/react-dialog","@radix-ui/react-slot"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
