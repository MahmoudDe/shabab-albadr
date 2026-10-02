import { Router, type IRouter, type Request } from "express";
import {
  CreateMatchBody,
  CreateQuestionBody,
  GetCompetitionDashboardResponse,
  GetLeaderboardResponse,
  ListMatchesResponse,
  ListPlayersResponse,
  ListQuestionsResponse,
  ListTeamsResponse,
  RecordCompetitionEventBody,
  RecordCompetitionEventResponse,
  UpdateMatchBody,
  UpdatePlayerBody,
  UpdateSettingsBody,
  UpdateTeamBody,
} from "@workspace/api-zod";
import {
  appendEvent,
  appendQuestion,
  createMatch,
  deleteMatch,
  getEvents,
  getMatches,
  getPlayerByToken,
  getPlayers,
  getQuestions,
  getSettings,
  getTeams,
  updateMatch,
  updatePlayer,
  updatePlayerPoints,
  updateSettings,
  updateTeam,
  type SheetMatch,
  type SheetPlayer,
  type SheetTeam,
} from "../lib/sheets";
import { canAccessTeam, requireAdmin, requireTrainer } from "../lib/auth";

const router: IRouter = Router();

type EventCategory =
  | "new"
  | "repeat"
  | "challenge"
  | "attendance"
  | "online"
  | "specialTask"
  | "total";

const categoryLabels: Record<EventCategory, string> = {
  new: "الجديد",
  repeat: "التكرار",
  challenge: "تحدي الثلاثين",
  attendance: "الحضور",
  online: "الأونلاين",
  specialTask: "المهمة الخاصة",
  total: "رصيد عام",
};

// Maps an event category to the player column it accumulates into.
const categoryColumn: Record<
  EventCategory,
  | "newPoints"
  | "repeatPoints"
  | "challengePoints"
  | "attendancePoints"
  | "onlinePoints"
  | "specialTaskPoints"
> = {
  new: "newPoints",
  repeat: "repeatPoints",
  challenge: "challengePoints",
  attendance: "attendancePoints",
  online: "onlinePoints",
  specialTask: "specialTaskPoints",
  total: "specialTaskPoints",
};

// Standings are derived from completed matches (win 3, draw 1, loss 0) so they
// can never drift from the actual results.
function teamRecord(teamId: number, matches: SheetMatch[]) {
  const record = { points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const m of matches) {
    if (m.status !== "مكتملة" && m.status !== "completed") continue;
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    record.goalsFor += gf;
    record.goalsAgainst += ga;
    if (gf > ga) { record.wins++; record.points += 3; }
    else if (gf === ga) { record.draws++; record.points += 1; }
    else record.losses++;
  }
  return record;
}

function teamDto(team: SheetTeam, players: SheetPlayer[], matches: SheetMatch[]) {
  const record = teamRecord(team.id, matches);
  const roster = players.filter((player) => player.teamId === team.id);
  const captain = roster.find((player) => player.id === team.captainId) ?? roster[0];
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    color: team.color,
    coach: team.coach,
    assistantCoach: team.assistantCoach,
    ...record,
    playerCount: roster.length,
    captainName: captain?.name ?? "لم يحدد",
  };
}

function playerDto(player: SheetPlayer, teamName: string) {
  const attributes = {
    pace: 40 + player.newPoints,
    defense: 40 + player.repeatPoints,
    shooting: 40 + player.challengePoints,
    dribbling: 40 + player.attendancePoints,
    passing: 40 + player.onlinePoints,
    physical: 40 + player.specialTaskPoints,
  };
  const average =
    (attributes.pace +
      attributes.defense +
      attributes.shooting +
      attributes.dribbling +
      attributes.passing +
      attributes.physical) /
    6;
  const rating = Math.max(1, Math.round(average) - player.redCards);
  const total =
    40 +
    player.newPoints +
    player.repeatPoints +
    player.challengePoints +
    player.attendancePoints +
    player.onlinePoints +
    player.specialTaskPoints -
    player.redCards;
  return {
    id: player.id,
    name: player.name,
    teamId: player.teamId,
    teamName,
    role: player.role,
    avatarInitials: player.avatarInitials,
    cardRating: rating,
    cardToken: player.cardToken,
    attributes,
    stats: {
      newPoints: player.newPoints,
      repeatPoints: player.repeatPoints,
      challengePoints: player.challengePoints,
      attendancePoints: player.attendancePoints,
      onlinePoints: player.onlinePoints,
      specialTaskPoints: player.specialTaskPoints,
      total,
      redCards: player.redCards,
      manOfMatch: player.manOfMatch,
    },
  };
}

async function getPlayerDtos() {
  const [players, teams] = await Promise.all([getPlayers(), getTeams()]);
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return players.map((player) =>
    playerDto(player, names.get(player.teamId) ?? "فريق غير معروف"),
  );
}

async function getTeamDtos() {
  const [teams, players, matches] = await Promise.all([getTeams(), getPlayers(), getMatches()]);
  return teams.map((team) => teamDto(team, players, matches));
}

async function getMatchDtos() {
  const [matches, teams] = await Promise.all([getMatches(), getTeams()]);
  const byId = new Map(teams.map((team) => [team.id, team]));
  return [...matches]
    .sort((a, b) => b.week - a.week)
    .map((match) => {
      const home = byId.get(match.homeTeamId);
      const away = byId.get(match.awayTeamId);
      return {
        id: match.id,
        week: match.week,
        status: match.status,
        dateLabel: match.dateLabel,
        homeTeamId: match.homeTeamId,
        homeTeamName: home?.name ?? "",
        homeTeamShortName: home?.shortName ?? "",
        awayTeamId: match.awayTeamId,
        awayTeamName: away?.name ?? "",
        awayTeamShortName: away?.shortName ?? "",
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        attacks: match.attacks,
      };
    });
}

router.get("/competition/dashboard", async (_req, res, next) => {
  try {
    const [teams, players, matches, events, settings] = await Promise.all([
      getTeamDtos(),
      getPlayerDtos(),
      getMatchDtos(),
      getEvents(),
      getSettings(),
    ]);
    const latest = matches[0];
    // Prefer a "رجل الجولة" for the featured spot; fall back to the top scorer.
    const menOfMatch = players.filter((p) => p.stats.manOfMatch);
    const featuredPlayer = (menOfMatch.length ? menOfMatch : players).sort(
      (a, b) => b.stats.total - a.stats.total,
    )[0];
    const activity = [...events]
      .sort((a, b) => b.id - a.id)
      .slice(0, 5)
      .map((event) => ({
        id: event.id,
        title: `${categoryLabels[event.category as EventCategory] ?? "تحديث"} — ${event.points > 0 ? `+${event.points}` : event.points}`,
        description: event.reason,
        timeLabel: "منذ قليل",
        type: event.points < 0 ? "warning" : "score",
      }));
    const payload = {
      seasonLabel: settings.seasonLabel,
      completedWeeks: settings.completedWeeks,
      totalWeeks: settings.totalWeeks,
      totalStudents: players.length,
      activePlayers: players.length,
      nextSessionLabel: latest?.status === "جارية" ? "الموعد الحالي" : "الموعد القادم",
      nextSessionDate: latest?.dateLabel ?? "لم تحدد بعد",
      featuredPlayer,
      teams,
      recentActivity: activity,
    };
    res.json(GetCompetitionDashboardResponse.parse(payload));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/teams", async (_req, res, next) => {
  try {
    res.json(ListTeamsResponse.parse(await getTeamDtos()));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/players", async (_req, res, next) => {
  try {
    res.json(ListPlayersResponse.parse(await getPlayerDtos()));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/matches", async (_req, res, next) => {
  try {
    res.json(ListMatchesResponse.parse(await getMatchDtos()));
  } catch (error) {
    next(error);
  }
});

router.patch("/competition/teams/:id", requireTrainer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "معرّف غير صالح" });
      return;
    }
    if (!canAccessTeam(req.trainer, id)) {
      res.status(403).json({ error: "لا تملك صلاحية على هذا الفريق" });
      return;
    }
    const patch = UpdateTeamBody.parse(req.body);

    // Captain assignment: the chosen captain must belong to this team.
    let players = await getPlayers();
    if (patch.captainId !== undefined) {
      const captain = players.find((p) => p.id === patch.captainId);
      if (!captain || captain.teamId !== id) {
        res.status(400).json({ error: "القائد يجب أن يكون من لاعبي الفريق" });
        return;
      }
    }

    const updated = await updateTeam(id, patch);
    if (!updated) {
      res.status(404).json({ error: "الفريق غير موجود" });
      return;
    }

    // Keep player roles in sync with the captain choice.
    if (patch.captainId !== undefined) {
      for (const p of players.filter((p) => p.teamId === id)) {
        const shouldBeCaptain = p.id === patch.captainId;
        const isCaptain = p.role === "كابتن";
        if (shouldBeCaptain && !isCaptain) await updatePlayer(p.id, { role: "كابتن" });
        else if (!shouldBeCaptain && isCaptain) await updatePlayer(p.id, { role: "لاعب" });
      }
      players = await getPlayers();
    }

    getRequestLog(req).info({ teamId: id }, "Competition team updated");
    res.json(ListTeamsResponse.element.parse(teamDto(updated, players, await getMatches())));
  } catch (error) {
    next(error);
  }
});

router.patch("/competition/players/:id", requireTrainer, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "معرّف غير صالح" });
      return;
    }
    const patch = UpdatePlayerBody.parse(req.body);
    const existing = (await getPlayers()).find((p) => p.id === id);
    if (!existing) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }
    if (!canAccessTeam(req.trainer, existing.teamId)) {
      res.status(403).json({ error: "لا تملك صلاحية على هذا اللاعب" });
      return;
    }
    if (patch.teamId !== undefined && patch.teamId !== existing.teamId) {
      // Transferring a player between teams is an admin-only action.
      if (req.trainer?.role !== "admin") {
        res.status(403).json({ error: "نقل اللاعب مخصّص للمشرف العام" });
        return;
      }
      const teams = await getTeams();
      if (!teams.some((team) => team.id === patch.teamId)) {
        res.status(400).json({ error: "الفريق الوجهة غير موجود" });
        return;
      }
    }
    const updated = await updatePlayer(id, patch);
    if (!updated) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    // "رجل الجولة" is one per team: clear it from the player's teammates.
    if (patch.manOfMatch === true) {
      const teammates = (await getPlayers()).filter(
        (p) => p.teamId === updated.teamId && p.id !== updated.id && p.manOfMatch,
      );
      for (const mate of teammates) {
        await updatePlayer(mate.id, { manOfMatch: false });
      }
    }

    const teams = await getTeams();
    const teamName = teams.find((team) => team.id === updated.teamId)?.name ?? "";
    getRequestLog(req).info({ playerId: id, teamId: updated.teamId }, "Competition player updated");
    res.json(ListPlayersResponse.element.parse(playerDto(updated, teamName)));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/settings", async (_req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    next(error);
  }
});

router.patch("/competition/settings", requireAdmin, async (req, res, next) => {
  try {
    const patch = UpdateSettingsBody.parse(req.body);
    const updated = await updateSettings(patch);
    getRequestLog(req).info("Competition settings updated");
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.post("/competition/matches", requireAdmin, async (req, res, next) => {
  try {
    const input = CreateMatchBody.parse(req.body);
    const created = await createMatch(input);
    const teams = await getTeams();
    const home = teams.find((t) => t.id === created.homeTeamId);
    const away = teams.find((t) => t.id === created.awayTeamId);
    getRequestLog(req).info({ matchId: created.id }, "Competition match created");
    res.status(201).json(
      ListMatchesResponse.element.parse({
        ...created,
        homeTeamName: home?.name ?? "",
        homeTeamShortName: home?.shortName ?? "",
        awayTeamName: away?.name ?? "",
        awayTeamShortName: away?.shortName ?? "",
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.patch("/competition/matches/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "معرّف غير صالح" });
      return;
    }
    const patch = UpdateMatchBody.parse(req.body);
    const updated = await updateMatch(id, patch);
    if (!updated) {
      res.status(404).json({ error: "المباراة غير موجودة" });
      return;
    }
    const teams = await getTeams();
    const home = teams.find((t) => t.id === updated.homeTeamId);
    const away = teams.find((t) => t.id === updated.awayTeamId);
    getRequestLog(req).info({ matchId: id }, "Competition match updated");
    res.json(
      ListMatchesResponse.element.parse({
        ...updated,
        homeTeamName: home?.name ?? "",
        homeTeamShortName: home?.shortName ?? "",
        awayTeamName: away?.name ?? "",
        awayTeamShortName: away?.shortName ?? "",
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.delete("/competition/matches/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "معرّف غير صالح" });
      return;
    }
    const removed = await deleteMatch(id);
    if (!removed) {
      res.status(404).json({ error: "المباراة غير موجودة" });
      return;
    }
    getRequestLog(req).info({ matchId: id }, "Competition match deleted");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/competition/leaderboard", async (_req, res, next) => {
  try {
    const payload = { teams: await getTeamDtos(), players: await getPlayerDtos() };
    res.json(GetLeaderboardResponse.parse(payload));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/card/:token", async (req, res, next) => {
  try {
    const player = await getPlayerByToken(req.params.token);
    if (!player) {
      res.status(404).json({ error: "البطاقة غير موجودة" });
      return;
    }
    const teams = await getTeams();
    const teamName = teams.find((team) => team.id === player.teamId)?.name ?? "";
    res.json(ListPlayersResponse.element.parse(playerDto(player, teamName)));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/questions", async (_req, res, next) => {
  try {
    const questions = await getQuestions();
    res.json(
      ListQuestionsResponse.parse([...questions].sort((a, b) => b.id - a.id)),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/competition/questions", requireTrainer, async (req, res, next) => {
  try {
    const input = CreateQuestionBody.parse(req.body);
    const created = await appendQuestion({
      category: input.category,
      prompt: input.prompt,
      points: input.points,
      difficulty: input.difficulty,
      isPublished: input.isPublished ?? true,
    });
    getRequestLog(req).info({ questionId: created.id }, "Competition question created");
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

function getRequestLog(req: Request) {
  return req.log;
}

router.post("/competition/events", requireTrainer, async (req, res, next) => {
  try {
    const input = RecordCompetitionEventBody.parse(req.body);

    const category = input.category as EventCategory;
    const allowedCategories = Object.keys(categoryLabels) as EventCategory[];
    if (!allowedCategories.includes(category)) {
      res.status(400).json({ error: "البند غير معروف" });
      return;
    }

    const target = (await getPlayers()).find((p) => p.id === input.playerId);
    if (!target) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }
    if (!canAccessTeam(req.trainer, target.teamId)) {
      res.status(403).json({ error: "لا تملك صلاحية على هذا اللاعب" });
      return;
    }

    const updated = await updatePlayerPoints(
      input.playerId,
      categoryColumn[category],
      input.points,
      input.points < 0,
    );
    if (!updated) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    await appendEvent({
      playerId: input.playerId,
      category,
      points: input.points,
      reason: input.reason,
    });

    getRequestLog(req).info(
      { playerId: input.playerId, category, points: input.points },
      "Competition event recorded",
    );

    const teams = await getTeams();
    const teamName = teams.find((team) => team.id === updated.teamId)?.name ?? "";
    res.status(201).json(RecordCompetitionEventResponse.parse(playerDto(updated, teamName)));
  } catch (error) {
    next(error);
  }
});

export default router;
