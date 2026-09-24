import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  competitionEvents,
  competitionMatches,
  competitionPlayers,
  competitionQuestions,
  competitionTeams,
  type CompetitionAttack,
} from "@workspace/db/schema";
import {
  GetCompetitionDashboardResponse,
  GetLeaderboardResponse,
  ListMatchesResponse,
  ListPlayersResponse,
  ListQuestionsResponse,
  ListTeamsResponse,
  RecordCompetitionEventBody,
  RecordCompetitionEventResponse,
} from "@workspace/api-zod";

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

const playerSeed = [
  ["عبدالرحمن السعدي", 1, "كابتن", 44, 36, 12, 8, 8, 4, 0],
  ["سلمان الحربي", 1, "لاعب", 40, 38, 10, 10, 6, 3, 0],
  ["أنس القحطاني", 1, "لاعب", 42, 34, 9, 12, 7, 5, 0],
  ["معاذ الغامدي", 1, "لاعب", 38, 37, 11, 7, 8, 4, 0],
  ["ياسر الشهري", 1, "لاعب", 41, 32, 10, 9, 7, 6, 0],
  ["زياد العتيبي", 1, "لاعب", 39, 35, 8, 11, 6, 4, 1],
  ["بدر المطيري", 2, "كابتن", 45, 39, 11, 8, 7, 5, 0],
  ["إياد الزهراني", 2, "لاعب", 42, 36, 9, 9, 8, 4, 0],
  ["حسن الشهري", 2, "لاعب", 40, 35, 12, 7, 6, 5, 0],
  ["مالك الدوسري", 2, "لاعب", 39, 37, 8, 10, 7, 3, 0],
  ["ريان المطيري", 2, "لاعب", 41, 34, 10, 8, 8, 4, 0],
  ["نايف العنزي", 2, "لاعب", 38, 33, 9, 9, 6, 5, 1],
  ["سعد القرني", 3, "كابتن", 43, 37, 10, 9, 8, 5, 0],
  ["أيمن الحازمي", 3, "لاعب", 39, 35, 11, 8, 7, 4, 0],
  ["عبدالله العمري", 3, "لاعب", 41, 36, 9, 10, 6, 4, 0],
  ["خالد الغامدي", 3, "لاعب", 40, 34, 10, 7, 8, 5, 0],
  ["وليد الزهراني", 3, "لاعب", 38, 33, 8, 11, 7, 3, 0],
  ["حمزة القحطاني", 3, "لاعب", 42, 35, 9, 8, 8, 4, 0],
  ["فهد العتيبي", 4, "كابتن", 44, 38, 12, 8, 7, 5, 0],
  ["مصعب الحربي", 4, "لاعب", 40, 36, 10, 9, 6, 4, 0],
  ["عمر الزهراني", 4, "لاعب", 39, 34, 11, 7, 8, 5, 0],
  ["سامي الدوسري", 4, "لاعب", 41, 35, 9, 10, 7, 4, 0],
  ["طارق المطيري", 4, "لاعب", 38, 33, 10, 8, 6, 5, 0],
  ["مهند العنزي", 4, "لاعب", 42, 37, 8, 9, 8, 4, 1],
] as const;

let seedPromise: Promise<void> | undefined;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.select({ id: competitionTeams.id }).from(competitionTeams).limit(1);
      if (existing.length > 0) return;

      const teamRows = await db
        .insert(competitionTeams)
        .values([
          { name: "فريق النور", shortName: "النور", color: "#2F8F83", coach: "أ. أبي", assistantCoach: "أ. سعيد", points: 9, wins: 3, draws: 0, losses: 1, goalsFor: 7, goalsAgainst: 4 },
          { name: "فريق الهدى", shortName: "الهدى", color: "#D5A33B", coach: "أ. بلال", assistantCoach: "أ. صهيب", points: 7, wins: 2, draws: 1, losses: 1, goalsFor: 6, goalsAgainst: 5 },
          { name: "فريق البصيرة", shortName: "البصيرة", color: "#7867B7", coach: "أ. أواب", assistantCoach: "أ. عبدالكريم", points: 6, wins: 2, draws: 0, losses: 2, goalsFor: 5, goalsAgainst: 5 },
          { name: "فريق الإحسان", shortName: "الإحسان", color: "#D97161", coach: "أ. مصطفى", assistantCoach: "أ. محمود", points: 4, wins: 1, draws: 1, losses: 2, goalsFor: 4, goalsAgainst: 6 },
        ])
        .returning({ id: competitionTeams.id });

      const players = await db
        .insert(competitionPlayers)
        .values(
          playerSeed.map(([name, teamId, role, newPoints, repeatPoints, challengePoints, attendancePoints, onlinePoints, specialTaskPoints, redCards]) => ({
            name,
            teamId,
            role,
            avatarInitials: initials(name),
            newPoints,
            repeatPoints,
            challengePoints,
            attendancePoints,
            onlinePoints,
            specialTaskPoints,
            redCards,
            manOfMatch: name === "عبدالرحمن السعدي",
          })),
        )
        .returning({ id: competitionPlayers.id, teamId: competitionPlayers.teamId });

      const captains = players.filter((player) => player.id % 6 === 1);
      for (const captain of captains) {
        await db.update(competitionTeams).set({ captainId: captain.id }).where(eq(competitionTeams.id, captain.teamId));
      }

      const attack = (id: number, label: string, description: string, status: string, winnerTeamId: number | null): CompetitionAttack => ({
        id,
        label,
        description,
        status,
        winnerTeamId,
      });

      await db.insert(competitionMatches).values([
        {
          week: 4,
          status: "جارية",
          dateLabel: "الأربعاء، 24 سبتمبر",
          homeTeamId: teamRows[0].id,
          awayTeamId: teamRows[1].id,
          homeScore: 2,
          awayScore: 1,
          attacks: [
            attack(1, "الهجمة الأولى", "تحدي الثلاثين — اختيار الفريق", "مكتملة", teamRows[0].id),
            attack(2, "الهجمة الثانية", "فقرة الحفظ والتسميع", "مكتملة", teamRows[1].id),
            attack(3, "الهجمة الثالثة", "الأونلاين", "قادمة", null),
            attack(4, "الهجمة الرابعة", "المهمة الخاصة", "مقفلة", null),
          ],
        },
        {
          week: 3,
          status: "مكتملة",
          dateLabel: "الأربعاء، 17 سبتمبر",
          homeTeamId: teamRows[2].id,
          awayTeamId: teamRows[3].id,
          homeScore: 2,
          awayScore: 1,
          attacks: [
            attack(1, "الهجمة الأولى", "تحدي الثلاثين — اختيار الفريق", "مكتملة", teamRows[2].id),
            attack(2, "الهجمة الثانية", "فقرة الحفظ والتسميع", "مكتملة", teamRows[3].id),
            attack(3, "الهجمة الثالثة", "الأونلاين", "مكتملة", teamRows[2].id),
            attack(4, "الهجمة الرابعة", "المهمة الخاصة", "مكتملة", teamRows[2].id),
          ],
        },
        {
          week: 5,
          status: "مجدولة",
          dateLabel: "الأربعاء، 1 أكتوبر",
          homeTeamId: teamRows[1].id,
          awayTeamId: teamRows[3].id,
          homeScore: 0,
          awayScore: 0,
          attacks: [
            attack(1, "الهجمة الأولى", "تحدي الثلاثين — اختيار الفريق", "مجدولة", null),
            attack(2, "الهجمة الثانية", "فقرة الحفظ والتسميع", "مجدولة", null),
            attack(3, "الهجمة الثالثة", "الأونلاين", "مجدولة", null),
            attack(4, "الهجمة الرابعة", "المهمة الخاصة", "مجدولة", null),
          ],
        },
      ]);

      await db.insert(competitionQuestions).values([
        { category: "ماذا تعرف؟", prompt: "ما السورة التي تسمى قلب القرآن؟", points: 5, difficulty: "متوسط", isPublished: true },
        { category: "ماذا تعرف؟", prompt: "اذكر ثلاثة من أسماء يوم القيامة.", points: 5, difficulty: "متوسط", isPublished: true },
        { category: "المزاد", prompt: "كم آية في سورة الفاتحة؟", points: 5, difficulty: "سهل", isPublished: true },
        { category: "المزاد", prompt: "ما أول ما نزل من القرآن؟", points: 5, difficulty: "متوسط", isPublished: true },
        { category: "الجرس", prompt: "أكمل: إنما الأعمال بالنيات...", points: 5, difficulty: "سهل", isPublished: true },
        { category: "الجرس", prompt: "ما اسم الصحابي الملقب بسيف الله المسلول؟", points: 5, difficulty: "متوسط", isPublished: true },
        { category: "الجرس", prompt: "اذكر أركان الإسلام.", points: 5, difficulty: "سهل", isPublished: false },
        { category: "المزاد", prompt: "ما أطول سورة في القرآن الكريم؟", points: 5, difficulty: "سهل", isPublished: true },
      ]);
    })();
  }
  return seedPromise;
}

function teamDto(
  team: typeof competitionTeams.$inferSelect,
  players: Array<typeof competitionPlayers.$inferSelect>,
) {
  const roster = players.filter((player) => player.teamId === team.id);
  const captain = roster.find((player) => player.id === team.captainId) ?? roster[0];
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    color: team.color,
    coach: team.coach,
    assistantCoach: team.assistantCoach,
    points: team.points,
    wins: team.wins,
    draws: team.draws,
    losses: team.losses,
    goalsFor: team.goalsFor,
    goalsAgainst: team.goalsAgainst,
    playerCount: roster.length,
    captainName: captain?.name ?? "لم يحدد",
  };
}

function playerDto(player: typeof competitionPlayers.$inferSelect, teamName: string) {
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
  const [players, teams] = await Promise.all([
    db.select().from(competitionPlayers),
    db.select().from(competitionTeams),
  ]);
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return players.map((player) => playerDto(player, names.get(player.teamId) ?? "فريق غير معروف"));
}

async function getTeamDtos() {
  const [teams, players] = await Promise.all([
    db.select().from(competitionTeams),
    db.select().from(competitionPlayers),
  ]);
  return teams.map((team) => teamDto(team, players));
}

async function getMatchDtos() {
  const [matches, teams] = await Promise.all([
    db.select().from(competitionMatches).orderBy(desc(competitionMatches.week)),
    db.select().from(competitionTeams),
  ]);
  const names = new Map(teams.map((team) => [team.id, team]));
  return matches.map((match) => {
    const home = names.get(match.homeTeamId);
    const away = names.get(match.awayTeamId);
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
      attacks: match.attacks as CompetitionAttack[],
    };
  });
}

router.get("/competition/dashboard", async (req, res, next) => {
  try {
    await ensureSeeded();
    const [teams, players, matches, events] = await Promise.all([
      getTeamDtos(),
      getPlayerDtos(),
      getMatchDtos(),
      db.select().from(competitionEvents).orderBy(desc(competitionEvents.createdAt)).limit(5),
    ]);
    const latest = matches[0];
    const featuredPlayer = [...players].sort((a, b) => b.stats.total - a.stats.total)[0];
    const activity = events.map((event) => ({
      id: event.id,
      title: `${categoryLabels[event.category as EventCategory] ?? "تحديث"} — ${event.points > 0 ? `+${event.points}` : event.points}`,
      description: event.reason,
      timeLabel: "منذ قليل",
      type: event.points < 0 ? "warning" : "score",
    }));
    const payload = {
      seasonLabel: "مسابقة الفصل الأول",
      completedWeeks: 3,
      totalWeeks: 8,
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
    await ensureSeeded();
    res.json(ListTeamsResponse.parse(await getTeamDtos()));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/players", async (_req, res, next) => {
  try {
    await ensureSeeded();
    res.json(ListPlayersResponse.parse(await getPlayerDtos()));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/matches", async (_req, res, next) => {
  try {
    await ensureSeeded();
    res.json(ListMatchesResponse.parse(await getMatchDtos()));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/leaderboard", async (_req, res, next) => {
  try {
    await ensureSeeded();
    const payload = { teams: await getTeamDtos(), players: await getPlayerDtos() };
    res.json(GetLeaderboardResponse.parse(payload));
  } catch (error) {
    next(error);
  }
});

router.get("/competition/questions", async (_req, res, next) => {
  try {
    await ensureSeeded();
    res.json(ListQuestionsResponse.parse(await db.select().from(competitionQuestions).orderBy(desc(competitionQuestions.id))));
  } catch (error) {
    next(error);
  }
});

function getRequestLog(req: Request) {
  return req.log;
}

router.post("/competition/events", async (req, res, next) => {
  try {
    await ensureSeeded();
    const input = RecordCompetitionEventBody.parse(req.body);
    const player = await db.select().from(competitionPlayers).where(eq(competitionPlayers.id, input.playerId)).limit(1);
    if (!player[0]) {
      res.status(404).json({ error: "الطالب غير موجود" });
      return;
    }

    const category = input.category as EventCategory;
    const allowedCategories = Object.keys(categoryLabels) as EventCategory[];
    if (!allowedCategories.includes(category)) {
      res.status(400).json({ error: "البند غير معروف" });
      return;
    }

    const current = player[0];
    const values = {
      newPoints: current.newPoints,
      repeatPoints: current.repeatPoints,
      challengePoints: current.challengePoints,
      attendancePoints: current.attendancePoints,
      onlinePoints: current.onlinePoints,
      specialTaskPoints: current.specialTaskPoints,
      redCards: current.redCards,
    };
    if (category === "total") {
      values.specialTaskPoints += input.points;
    } else if (category === "new") {
      values.newPoints += input.points;
    } else if (category === "repeat") {
      values.repeatPoints += input.points;
    } else if (category === "challenge") {
      values.challengePoints += input.points;
    } else if (category === "attendance") {
      values.attendancePoints += input.points;
    } else if (category === "online") {
      values.onlinePoints += input.points;
    } else if (category === "specialTask") {
      values.specialTaskPoints += input.points;
    }
    if (input.points < 0) values.redCards += 1;

    const [updated] = await db
      .update(competitionPlayers)
      .set(values)
      .where(eq(competitionPlayers.id, input.playerId))
      .returning();
    await db.insert(competitionEvents).values({
      playerId: input.playerId,
      category,
      points: input.points,
      reason: input.reason,
    });
    getRequestLog(req).info({ playerId: input.playerId, category, points: input.points }, "Competition event recorded");
    const teams = await db.select().from(competitionTeams);
    res.status(201).json(RecordCompetitionEventResponse.parse(playerDto(updated, teams.find((team) => team.id === updated.teamId)?.name ?? "")));
  } catch (error) {
    next(error);
  }
});

export default router;