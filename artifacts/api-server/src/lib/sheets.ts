import { readFileSync } from "node:fs";
import path from "node:path";
import { GoogleAuth, type AuthClient } from "google-auth-library";

/**
 * Google Sheets data-access layer.
 *
 * The competition backend is a single Google Sheet with five tabs:
 * Teams, Players, Matches, Questions, Events. Each tab's first row holds
 * column headers that match the field names used throughout the API.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getSheetId(): string {
  const id = process.env["SHEET_ID"];
  if (!id) {
    throw new Error("SHEET_ID environment variable is required.");
  }
  return id;
}

function loadCredentials(): Record<string, unknown> {
  const inline = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (inline) {
    return JSON.parse(inline);
  }
  const file =
    process.env["GOOGLE_APPLICATION_CREDENTIALS"] ??
    path.resolve(process.cwd(), "secrets/service-account.json");
  return JSON.parse(readFileSync(file, "utf8"));
}

let authClientPromise: Promise<AuthClient> | undefined;

function getAuthClient(): Promise<AuthClient> {
  if (!authClientPromise) {
    const auth = new GoogleAuth({
      credentials: loadCredentials(),
      scopes: SCOPES,
    });
    authClientPromise = auth.getClient();
  }
  return authClientPromise;
}

async function apiRequest<T>(
  urlPath: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const client = await getAuthClient();
  const response = await client.request<T>({
    url: `${SHEETS_API}/${getSheetId()}${urlPath}`,
    method: (init?.method ?? "GET") as "GET",
    data: init?.body,
  });
  return response.data;
}

// --- Simple TTL cache for tab reads (Sheets has per-minute read quotas) ---

const CACHE_TTL_MS = 2000;
type CacheEntry = { at: number; rows: string[][] };
const cache = new Map<string, CacheEntry>();

function invalidate(tab?: string) {
  if (tab) cache.delete(tab);
  else cache.clear();
}

async function readTab(tab: string): Promise<string[][]> {
  const cached = cache.get(tab);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rows;
  }
  const data = await apiRequest<{ values?: string[][] }>(
    `/values/${encodeURIComponent(tab)}`,
  );
  const rows = data.values ?? [];
  cache.set(tab, { at: Date.now(), rows });
  return rows;
}

/** Parse a tab into objects keyed by its header row. */
async function readObjects(tab: string): Promise<Record<string, string>[]> {
  const rows = await readTab(tab);
  if (rows.length < 2) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => cell !== "" && cell != null))
    .map((row) => {
      const obj: Record<string, string> = {};
      header.forEach((key, i) => {
        obj[key] = row[i] ?? "";
      });
      return obj;
    });
}

async function appendRow(tab: string, values: (string | number | boolean)[]) {
  await apiRequest(
    `/values/${encodeURIComponent(tab)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: { values: [values] } },
  );
  invalidate(tab);
}

async function updateRow(
  tab: string,
  rowNumber: number,
  values: (string | number | boolean)[],
) {
  const range = `${tab}!A${rowNumber}`;
  await apiRequest(
    `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: "PUT", body: { range, values: [values] } },
  );
  invalidate(tab);
}

// --- Coercion helpers ---

const n = (v: string | undefined) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
};
const b = (v: string | undefined) => String(v).trim().toUpperCase() === "TRUE";

// --- Domain types ---

export type SheetTeam = {
  id: number;
  name: string;
  shortName: string;
  color: string;
  coach: string;
  assistantCoach: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  captainId: number | null;
};

export type SheetPlayer = {
  id: number;
  name: string;
  teamId: number;
  role: string;
  avatarInitials: string;
  newPoints: number;
  repeatPoints: number;
  challengePoints: number;
  attendancePoints: number;
  onlinePoints: number;
  specialTaskPoints: number;
  redCards: number;
  manOfMatch: boolean;
  cardToken: string;
};

export type TrainerRole = "admin" | "coach";

export type SheetTrainer = {
  id: number;
  name: string;
  username: string;
  pin: string;
  role: TrainerRole;
  teamId: number | null;
};

export type SheetAttack = {
  id: number;
  label: string;
  description: string;
  status: string;
  winnerTeamId: number | null;
};

export type SheetMatch = {
  id: number;
  week: number;
  status: string;
  dateLabel: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  attacks: SheetAttack[];
};

export type SheetQuestion = {
  id: number;
  category: string;
  prompt: string;
  points: number;
  difficulty: string;
  isPublished: boolean;
};

export type SheetEvent = {
  id: number;
  playerId: number;
  category: string;
  points: number;
  reason: string;
  createdAt: string;
};

export type SheetSettings = {
  seasonLabel: string;
  completedWeeks: number;
  totalWeeks: number;
  /** Public site URL used for player QR codes; empty = use the current origin. */
  publicUrl: string;
};

const SETTINGS_DEFAULTS: SheetSettings = {
  seasonLabel: "مسابقة الفصل الأول",
  completedWeeks: 3,
  totalWeeks: 8,
  publicUrl: "",
};

// Column order MUST match the header rows in the sheet.
const PLAYER_COLUMNS = [
  "newPoints",
  "repeatPoints",
  "challengePoints",
  "attendancePoints",
  "onlinePoints",
  "specialTaskPoints",
] as const;

// --- Readers ---

export async function getTeams(): Promise<SheetTeam[]> {
  return (await readObjects("Teams")).map((r) => ({
    id: n(r["id"]),
    name: r["name"] ?? "",
    shortName: r["shortName"] ?? "",
    color: r["color"] ?? "",
    coach: r["coach"] ?? "",
    assistantCoach: r["assistantCoach"] ?? "",
    points: n(r["points"]),
    wins: n(r["wins"]),
    draws: n(r["draws"]),
    losses: n(r["losses"]),
    goalsFor: n(r["goalsFor"]),
    goalsAgainst: n(r["goalsAgainst"]),
    captainId: r["captainId"] ? n(r["captainId"]) : null,
  }));
}

export async function getPlayers(): Promise<SheetPlayer[]> {
  return (await readObjects("Players")).map((r) => ({
    id: n(r["id"]),
    name: r["name"] ?? "",
    teamId: n(r["teamId"]),
    role: r["role"] ?? "لاعب",
    avatarInitials: r["avatarInitials"] ?? "",
    newPoints: n(r["newPoints"]),
    repeatPoints: n(r["repeatPoints"]),
    challengePoints: n(r["challengePoints"]),
    attendancePoints: n(r["attendancePoints"]),
    onlinePoints: n(r["onlinePoints"]),
    specialTaskPoints: n(r["specialTaskPoints"]),
    redCards: n(r["redCards"]),
    manOfMatch: b(r["manOfMatch"]),
    cardToken: r["cardToken"] ?? "",
  }));
}

export async function getTrainers(): Promise<SheetTrainer[]> {
  return (await readObjects("Trainers")).map((r) => ({
    id: n(r["id"]),
    name: r["name"] ?? "",
    username: (r["username"] ?? "").trim(),
    pin: (r["pin"] ?? "").trim(),
    role: (r["role"] ?? "").trim().toLowerCase() === "admin" ? "admin" : "coach",
    teamId: r["teamId"] ? n(r["teamId"]) : null,
  }));
}

export async function findTrainer(
  username: string,
  pin: string,
): Promise<SheetTrainer | undefined> {
  const trainers = await getTrainers();
  const uname = username.trim().toLowerCase();
  return trainers.find(
    (t) => t.username.toLowerCase() === uname && t.pin === pin.trim(),
  );
}

export async function getPlayerByToken(
  token: string,
): Promise<SheetPlayer | undefined> {
  const players = await getPlayers();
  return players.find((p) => p.cardToken && p.cardToken === token);
}

export async function getMatches(): Promise<SheetMatch[]> {
  return (await readObjects("Matches")).map((r) => {
    let attacks: SheetAttack[] = [];
    try {
      attacks = r["attacks"] ? (JSON.parse(r["attacks"]) as SheetAttack[]) : [];
    } catch {
      attacks = [];
    }
    return {
      id: n(r["id"]),
      week: n(r["week"]),
      status: r["status"] ?? "",
      dateLabel: r["dateLabel"] ?? "",
      homeTeamId: n(r["homeTeamId"]),
      awayTeamId: n(r["awayTeamId"]),
      homeScore: n(r["homeScore"]),
      awayScore: n(r["awayScore"]),
      attacks,
    };
  });
}

export async function getQuestions(): Promise<SheetQuestion[]> {
  return (await readObjects("Questions")).map((r) => ({
    id: n(r["id"]),
    category: r["category"] ?? "",
    prompt: r["prompt"] ?? "",
    points: n(r["points"]),
    difficulty: r["difficulty"] ?? "",
    isPublished: b(r["isPublished"]),
  }));
}

export async function getEvents(): Promise<SheetEvent[]> {
  return (await readObjects("Events")).map((r) => ({
    id: n(r["id"]),
    playerId: n(r["playerId"]),
    category: r["category"] ?? "",
    points: n(r["points"]),
    reason: r["reason"] ?? "",
    createdAt: r["createdAt"] ?? "",
  }));
}

// --- Writers ---

function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/** Append a competition event to the Events log. Returns the new event. */
export async function appendEvent(input: {
  playerId: number;
  category: string;
  points: number;
  reason: string;
}): Promise<SheetEvent> {
  const events = await getEvents();
  const event: SheetEvent = {
    id: nextId(events),
    playerId: input.playerId,
    category: input.category,
    points: input.points,
    reason: input.reason,
    createdAt: new Date().toISOString(),
  };
  await appendRow("Events", [
    event.id,
    event.playerId,
    event.category,
    event.points,
    event.reason,
    event.createdAt,
  ]);
  return event;
}

/**
 * Apply a point delta to a player's category and persist the updated row.
 * Returns the updated player.
 */
export async function updatePlayerPoints(
  playerId: number,
  column: (typeof PLAYER_COLUMNS)[number],
  delta: number,
  addRedCard: boolean,
): Promise<SheetPlayer | undefined> {
  const players = await getPlayers();
  const index = players.findIndex((p) => p.id === playerId);
  if (index === -1) return undefined;

  const player = { ...players[index] };
  player[column] += delta;
  if (addRedCard) player.redCards += 1;

  // Data rows start at sheet row 2 (row 1 is the header).
  const rowNumber = index + 2;
  await updateRow("Players", rowNumber, [
    player.id,
    player.name,
    player.teamId,
    player.role,
    player.avatarInitials,
    player.newPoints,
    player.repeatPoints,
    player.challengePoints,
    player.attendancePoints,
    player.onlinePoints,
    player.specialTaskPoints,
    player.redCards,
    player.manOfMatch,
  ]);
  return player;
}

// --- Settings (key/value tab) ---

export async function getSettings(): Promise<SheetSettings> {
  const rows = await readObjects("Settings");
  const map = new Map(rows.map((r) => [r["key"], r["value"]]));
  return {
    seasonLabel: map.get("seasonLabel") || SETTINGS_DEFAULTS.seasonLabel,
    completedWeeks: map.has("completedWeeks")
      ? n(map.get("completedWeeks"))
      : SETTINGS_DEFAULTS.completedWeeks,
    totalWeeks: map.has("totalWeeks")
      ? n(map.get("totalWeeks"))
      : SETTINGS_DEFAULTS.totalWeeks,
    publicUrl: (map.get("publicUrl") ?? "").trim(),
  };
}

export async function updateSettings(
  patch: Partial<SheetSettings>,
): Promise<SheetSettings> {
  const rows = await readTab("Settings");
  const header = rows[0] ?? ["key", "value"];
  const keyCol = header.indexOf("key");
  const body = rows.slice(1);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const idx = body.findIndex((r) => r[keyCol] === key);
    if (idx === -1) {
      await appendRow("Settings", [key, String(value)]);
    } else {
      const rowNumber = idx + 2; // header on row 1
      await updateRow("Settings", rowNumber, [key, String(value)]);
    }
  }
  invalidate("Settings");
  return getSettings();
}

// --- Matches (create / edit) ---

export async function createMatch(input: {
  week: number;
  status: string;
  dateLabel: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  attacks: SheetAttack[];
}): Promise<SheetMatch> {
  const matches = await getMatches();
  const match: SheetMatch = { id: nextId(matches), ...input };
  await appendRow("Matches", [
    match.id,
    match.week,
    match.status,
    match.dateLabel,
    match.homeTeamId,
    match.awayTeamId,
    match.homeScore,
    match.awayScore,
    JSON.stringify(match.attacks),
  ]);
  return match;
}

let sheetGidCache: Map<string, number> | undefined;

async function getSheetGid(title: string): Promise<number | undefined> {
  if (!sheetGidCache) {
    const meta = await apiRequest<{
      sheets: { properties: { title: string; sheetId: number } }[];
    }>("");
    sheetGidCache = new Map(
      meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]),
    );
  }
  return sheetGidCache.get(title);
}

export async function deleteMatch(id: number): Promise<boolean> {
  const rows = await readTab("Matches");
  // rows[0] is the header; data rows follow. Find the sheet row index (0-based).
  const dataIndex = rows.slice(1).findIndex((r) => Number(r[0]) === id);
  if (dataIndex === -1) return false;
  const gid = await getSheetGid("Matches");
  if (gid === undefined) return false;
  const rowIndex = dataIndex + 1; // account for header row
  await apiRequest(":batchUpdate", {
    method: "POST",
    body: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: gid,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
  invalidate("Matches");
  return true;
}

export async function updateMatch(
  id: number,
  patch: Partial<Omit<SheetMatch, "id">>,
): Promise<SheetMatch | undefined> {
  const matches = await getMatches();
  const index = matches.findIndex((m) => m.id === id);
  if (index === -1) return undefined;
  const match = { ...matches[index], ...patch };
  const rowNumber = index + 2; // header on row 1
  await updateRow("Matches", rowNumber, [
    match.id,
    match.week,
    match.status,
    match.dateLabel,
    match.homeTeamId,
    match.awayTeamId,
    match.homeScore,
    match.awayScore,
    JSON.stringify(match.attacks),
  ]);
  return match;
}

/** Apply field edits to a team row (e.g. rename). Returns the updated team. */
export async function updateTeam(
  id: number,
  patch: Partial<Pick<SheetTeam, "name" | "shortName" | "captainId">>,
): Promise<SheetTeam | undefined> {
  const teams = await getTeams();
  const index = teams.findIndex((t) => t.id === id);
  if (index === -1) return undefined;

  const team = { ...teams[index], ...patch };
  const rowNumber = index + 2; // row 1 is the header
  await updateRow("Teams", rowNumber, [
    team.id,
    team.name,
    team.shortName,
    team.color,
    team.coach,
    team.assistantCoach,
    team.points,
    team.wins,
    team.draws,
    team.losses,
    team.goalsFor,
    team.goalsAgainst,
    team.captainId ?? "",
  ]);
  return team;
}

/**
 * Apply field edits to a player row: rename and/or transfer to another team.
 * Returns the updated player.
 */
export async function updatePlayer(
  id: number,
  patch: Partial<Pick<SheetPlayer, "name" | "teamId" | "role" | "manOfMatch">>,
): Promise<SheetPlayer | undefined> {
  const players = await getPlayers();
  const index = players.findIndex((p) => p.id === id);
  if (index === -1) return undefined;

  const player = { ...players[index], ...patch };
  const rowNumber = index + 2; // row 1 is the header
  await updateRow("Players", rowNumber, [
    player.id,
    player.name,
    player.teamId,
    player.role,
    player.avatarInitials,
    player.newPoints,
    player.repeatPoints,
    player.challengePoints,
    player.attendancePoints,
    player.onlinePoints,
    player.specialTaskPoints,
    player.redCards,
    player.manOfMatch,
  ]);
  return player;
}

/** Append a new question to the Questions tab. Returns the created question. */
export async function appendQuestion(input: {
  category: string;
  prompt: string;
  points: number;
  difficulty: string;
  isPublished: boolean;
}): Promise<SheetQuestion> {
  const questions = await getQuestions();
  const question: SheetQuestion = { id: nextId(questions), ...input };
  await appendRow("Questions", [
    question.id,
    question.category,
    question.prompt,
    question.points,
    question.difficulty,
    question.isPublished,
  ]);
  return question;
}
