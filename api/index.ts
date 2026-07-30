import app from "../server";

export default function handler(req: any, res: any) {
  try {
    let rawUrl = req.url || "/";
    let pathname = rawUrl.split("?")[0];
    
    // Extract query param path or url if passed by Vercel rewrite
    let queryPath = "";
    if (rawUrl.includes("?")) {
      try {
        const queryStr = rawUrl.split("?").slice(1).join("?");
        const params = new URLSearchParams(queryStr);
        queryPath = params.get("path") || params.get("url") || "";
      } catch (e) {}
    }

    let targetPath = queryPath || pathname;

    // Check headers x-forwarded-uri or x-original-url if targetPath is generic /api/index.ts
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

    // Clean duplicate /api/api/
    targetPath = targetPath.replace(/^\/api\/api\//, "/api/");

    // Clean path and url search params from query
    let cleanQueryStr = "";
    if (rawUrl.includes("?")) {
      try {
        const queryStr = rawUrl.split("?").slice(1).join("?");
        const params = new URLSearchParams(queryStr);
        params.delete("path");
        params.delete("url");
        const s = params.toString();
        if (s) cleanQueryStr = "?" + s;
      } catch (e) {}
    }

    const finalUrl = targetPath + cleanQueryStr;

    // Set req.url and clear Express cached route properties
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


