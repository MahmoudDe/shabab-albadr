import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Minimal stateless session tokens for trainers.
 *
 * A token is `base64url(payload).base64url(hmacSHA256(payload))`, signed with
 * SESSION_SECRET. No database of sessions is needed — the signature proves the
 * token was issued by us and has not expired.
 */

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 8) {
    throw new Error(
      "SESSION_SECRET environment variable is required (>= 8 chars).",
    );
  }
  return secret;
}

export type TrainerRole = "admin" | "coach";

type TokenPayload = {
  sub: string; // trainer username
  name: string;
  role: TrainerRole;
  teamId: number | null; // null for admin (all teams)
  exp: number; // epoch ms
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function issueTrainerToken(trainer: {
  username: string;
  name: string;
  role: TrainerRole;
  teamId: number | null;
}): string {
  const payload: TokenPayload = {
    sub: trainer.username,
    name: trainer.name,
    role: trainer.role,
    teamId: trainer.teamId,
    exp: Date.now() + DEFAULT_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as TokenPayload;
    if (payload.role !== "admin" && payload.role !== "coach") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Augment Express Request with the authenticated trainer.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      trainer?: TokenPayload;
    }
  }
}

/** Express middleware: require a valid trainer bearer token (admin or coach). */
export function requireTrainer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const payload = match ? verifyToken(match[1]) : null;
  if (!payload) {
    res.status(401).json({ error: "يلزم تسجيل الدخول كمدرّب" });
    return;
  }
  req.trainer = payload;
  next();
}

/** Express middleware: require an admin bearer token. */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const payload = match ? verifyToken(match[1]) : null;
  if (!payload) {
    res.status(401).json({ error: "يلزم تسجيل الدخول" });
    return;
  }
  if (payload.role !== "admin") {
    res.status(403).json({ error: "هذه العملية مخصّصة للمشرف العام" });
    return;
  }
  req.trainer = payload;
  next();
}

/**
 * Whether the authenticated trainer may act on the given team.
 * Admins may act on any team; coaches only on their own.
 */
export function canAccessTeam(
  trainer: TokenPayload | undefined,
  teamId: number,
): boolean {
  if (!trainer) return false;
  if (trainer.role === "admin") return true;
  return trainer.teamId === teamId;
}
