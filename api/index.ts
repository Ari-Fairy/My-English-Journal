import app from "../server";

export default function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel Handler Error]", err);
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
