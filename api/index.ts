import app from "../server";

export default function handler(req: any, res: any) {
  return new Promise<void>((resolve) => {
    res.on("finish", () => resolve());
    res.on("close", () => resolve());
    res.on("error", () => resolve());

    try {
      app(req, res);
    } catch (err: any) {
      console.error("[Vercel Handler Error]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "Internal server error" });
      }
      resolve();
    }
  });
}

