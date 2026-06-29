import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: { host: "::", port: 8080, hmr: { overlay: false } },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":    ["react", "react-dom", "react-router-dom"],
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
          "vendor-syntax":   ["react-syntax-highlighter"],
          "vendor-math":     ["katex", "rehype-katex", "remark-math"],
          "vendor-ui":       ["@radix-ui/react-dialog", "@radix-ui/react-slot", "@radix-ui/react-label", "@radix-ui/react-separator", "@radix-ui/react-toggle"],

        },
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    minify: "esbuild",
  },
});
