import { put, del } from "@vercel/blob";
import { isAdmin } from "./_auth.js";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "POST") {
    const { name, type, data } = req.body || {};
    const ext = TYPES[type];
    if (!ext || typeof data !== "string") {
      return res.status(400).json({ error: "Only jpeg/png/webp images or PDF files are allowed" });
    }
    const safe = String(name || "file").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "-").slice(0, 40);
    const folder = ext === "pdf" ? "files" : "images";
    try {
      const blob = await put(`site/${folder}/${safe}.${ext}`, Buffer.from(data, "base64"), {
        access: "public",
        contentType: type,
        addRandomSuffix: true,
      });
      return res.status(200).json({ url: blob.url });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Upload failed", details: e.message });
    }
  }

  if (req.method === "DELETE") {
    const { url } = req.body || {};
    // only ever delete files this admin uploaded
    if (
      typeof url === "string" &&
      (url.includes(".blob.vercel-storage.com/site/images/") ||
        url.includes(".blob.vercel-storage.com/site/files/"))
    ) {
      try { await del(url); } catch (e) { console.error(e); }
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
