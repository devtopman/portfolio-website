import { put, list } from "@vercel/blob";
import { isAdmin } from "./_auth.js";

const PATH = "site/content.json";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const { blobs } = await list({ prefix: PATH, limit: 1 });
      if (!blobs.length) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json(null); // nothing saved yet -> site uses defaults
      }
      const r = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: "no-store" });
      const data = await r.json();
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(data);
    } catch (e) {
      console.error(e);
      return res.status(200).json(null);
    }
  }

  if (req.method === "POST") {
    if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Invalid content" });
    }
    try {
      await put(PATH, JSON.stringify(body), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to save", details: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
