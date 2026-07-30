import app from "../server.js";

export default function handler(req: any, res: any) {
  try {
    let rawUrl = req.url || "/";
    let pathname = rawUrl.split("?")[0];
    const queryStr = rawUrl.includes("?") ? "?" + rawUrl.split("?").slice(1).join("?") : "";

    let targetPath = pathname;

    // Fallback to headers if Vercel invoked /api/index directly
    if (targetPath.includes("index.ts") || targetPath.includes("index.js") || targetPath === "/api" || targetPath === "/api/") {
      const fwd = (req.headers?.["x-forwarded-uri"] || req.headers?.["x-original-url"] || req.headers?.["x-matched-path"]) as string;
      if (fwd && fwd.startsWith("/api") && !fwd.includes("index")) {
        targetPath = fwd.split("?")[0];
      } else {
        targetPath = "/api/health";
      }
    }

    if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
    if (!targetPath.startsWith("/api")) targetPath = "/api" + targetPath;
    targetPath = targetPath.replace(/^\/api\/api\//, "/api/");

    const finalUrl = targetPath + queryStr;

    req.url = finalUrl;
    req.originalUrl = finalUrl;
    delete (req as any)._parsedUrl;
    delete (req as any)._parsedUrlUrl;
    delete (req as any)._parsedOriginalUrl;

    return new Promise<void>((resolve) => {
      res.on("finish", () => resolve());
      res.on("close", () => resolve());
      res.on("error", () => resolve());

      try {
        app(req, res);
      } catch (err: any) {
        console.error("[Vercel App Dispatch Error]", err);
        if (!res.headersSent) {
          res.status(500).json({ error: err?.message || "Internal server error" });
        }
        resolve();
      }
    });
  } catch (outerErr: any) {
    console.error("[Vercel Handler Exception]", outerErr);
    if (!res.headersSent) {
      res.status(500).json({ error: outerErr?.message || "Handler error" });
    }
  }
}



