import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const competitionTeams = pgTable("competition_teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  color: text("color").notNull(),
  coach: text("coach").notNull(),
  assistantCoach: text("assistant_coach").notNull(),
  points: integer("points").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  captainId: integer("captain_id"),
});

export const competitionPlayers = pgTable("competition_players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  teamId: integer("team_id").notNull().references(() => competitionTeams.id),
  role: text("role").notNull().default("لاعب"),
  avatarInitials: text("avatar_initials").notNull(),
  newPoints: integer("new_points").notNull().default(0),
  repeatPoints: integer("repeat_points").notNull().default(0),
  challengePoints: integer("challenge_points").notNull().default(0),
  attendancePoints: integer("attendance_points").notNull().default(0),
  onlinePoints: integer("online_points").notNull().default(0),
  specialTaskPoints: integer("special_task_points").notNull().default(0),
  redCards: integer("red_cards").notNull().default(0),
  manOfMatch: boolean("man_of_match").notNull().default(false),
});

export const competitionMatches = pgTable("competition_matches", {
  id: serial("id").primaryKey(),
  week: integer("week").notNull(),
  status: text("status").notNull(),
  dateLabel: text("date_label").notNull(),
  homeTeamId: integer("home_team_id").notNull().references(() => competitionTeams.id),
  awayTeamId: integer("away_team_id").notNull().references(() => competitionTeams.id),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  attacks: jsonb("attacks").notNull(),
});

export const competitionQuestions = pgTable("competition_questions", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  prompt: text("prompt").notNull(),
  points: integer("points").notNull(),
  difficulty: text("difficulty").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
});

export const competitionEvents = pgTable("competition_events", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => competitionPlayers.id),
  category: text("category").notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompetitionTeamSchema = createInsertSchema(competitionTeams).omit({ id: true });
export const insertCompetitionPlayerSchema = createInsertSchema(competitionPlayers).omit({ id: true });
export const insertCompetitionMatchSchema = createInsertSchema(competitionMatches).omit({ id: true });
export const insertCompetitionQuestionSchema = createInsertSchema(competitionQuestions).omit({ id: true });
export const insertCompetitionEventSchema = createInsertSchema(competitionEvents).omit({ id: true, createdAt: true });

export type CompetitionTeam = typeof competitionTeams.$inferSelect;
export type CompetitionPlayer = typeof competitionPlayers.$inferSelect;
export type CompetitionMatch = typeof competitionMatches.$inferSelect;
export type CompetitionQuestion = typeof competitionQuestions.$inferSelect;
export type CompetitionEvent = typeof competitionEvents.$inferSelect;
export type CompetitionAttack = {
  id: number;
  label: string;
  description: string;
  status: string;
  winnerTeamId: number | null;
};
export const competitionAttackSchema = z.object({
  id: z.number(),
  label: z.string(),
  description: z.string(),
  status: z.string(),
  winnerTeamId: z.number().nullable(),
});