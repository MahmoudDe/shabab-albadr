import app from "./app";
import { logger } from "./lib/logger";

// Load local .env (SHEET_ID, PORT, credentials path) when present.
// In production these come from the platform's environment/secrets.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
