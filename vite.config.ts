import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

// Local stand-in for /api/content and /api/upload so /admin works under
// `npm run dev` without Vercel. Production uses the real functions in /api.
function devAdminApi(password: string): Plugin {
  const contentFile = path.resolve(".dev-content.json");
  const uploadDir = path.resolve("public/images/uploads");
  const readBody = (req: any) =>
    new Promise<any>((resolve) => {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c));
      req.on("end", () => {
        try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
      });
    });
  const send = (res: any, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  const authed = (req: any) => req.headers["x-admin-password"] === password;

  return {
    name: "dev-admin-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/content", async (req, res) => {
        if (req.method === "GET") {
          return send(res, 200, fs.existsSync(contentFile)
            ? JSON.parse(fs.readFileSync(contentFile, "utf8")) : null);
        }
        if (req.method === "POST") {
          if (!authed(req)) return send(res, 401, { error: "Unauthorized" });
          fs.writeFileSync(contentFile, JSON.stringify(await readBody(req), null, 2));
          return send(res, 200, { ok: true });
        }
        send(res, 405, { error: "Method not allowed" });
      });
      server.middlewares.use("/api/upload", async (req, res) => {
        if (!authed(req)) return send(res, 401, { error: "Unauthorized" });
        if (req.method === "POST") {
          const { name, type, data } = await readBody(req);
          const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as any)[type];
          if (!ext || typeof data !== "string") return send(res, 400, { error: "Bad file" });
          const safe = String(name || "image").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
          const file = `${safe}-${Date.now()}.${ext}`;
          fs.mkdirSync(uploadDir, { recursive: true });
          fs.writeFileSync(path.join(uploadDir, file), Buffer.from(data, "base64"));
          return send(res, 200, { url: `/images/uploads/${file}` });
        }
        send(res, 200, { ok: true });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), devAdminApi(env.ADMIN_PASSWORD || "admin")],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'three': ['three', 'three-stdlib'],
            'react-three': ['@react-three/fiber', '@react-three/drei'],
            'gsap': ['gsap'],
            'vendor': ['react', 'react-dom', 'react-router-dom']
          }
        }
      },
      chunkSizeWarningLimit: 1000,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    optimizeDeps: {
      include: ['three', 'gsap', 'lenis']
    }
  };
});
