import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// --- Serve the built frontend (single-service production deploy) ---
// In production the Vite app is built to shabab-albadr/dist/public and served
// from the same origin as the API, so there is no CORS or proxy to configure.
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env["STATIC_DIR"]
  ? path.resolve(process.env["STATIC_DIR"])
  : path.resolve(here, "..", "..", "shabab-albadr", "dist", "public");

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback: send index.html for any non-API GET so client routes
  // (e.g. /players, /card/:token) work on direct load / refresh.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info({ staticDir }, "Serving built frontend");
} else {
  logger.warn({ staticDir }, "Frontend build not found; serving API only");
}

export default app;
