import * as SQLite from "expo-sqlite";
import { AI_REPORT_QUERIES } from "./reportQueries";
import { AiReport, AiActionType, AiReportSnapshot, AiResult } from "./types";

const MAX_REPORTS = 30;
const MAX_AGE_DAYS = 30;

interface AiReportRow {
  id: string;
  action: string;
  createdAt: number;
  snapshot: string;
  response: string;
  pinned: number;
}

export async function initAiReportsTable(db: SQLite.SQLiteDatabase) {
  await db.execAsync(AI_REPORT_QUERIES.createTable);

  // Автоматическая очистка старых записей
  await cleanupOldReports(db);
}

export async function saveAiReport(
  db: SQLite.SQLiteDatabase,
  action: AiActionType,
  snapshot: AiReportSnapshot,
  response: AiResult,
): Promise<AiReport> {
  const report: AiReport = {
    id:
      response.id ||
      `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    createdAt: Date.now(),
    snapshot,
    response,
    pinned: false,
  };

  await db.runAsync(AI_REPORT_QUERIES.insert, [
    report.id,
    report.action,
    report.createdAt,
    JSON.stringify(report.snapshot),
    JSON.stringify(report.response),
    report.pinned ? 1 : 0,
  ]);

  // Удаляем лишние, если превышен лимит
  await trimExcessReports(db);

  return report;
}

export async function loadAiReports(
  db: SQLite.SQLiteDatabase,
): Promise<AiReport[]> {
  const rows = await db.getAllAsync<AiReportRow>(AI_REPORT_QUERIES.selectAll, [
    MAX_REPORTS,
  ]);

  return rows.map(mapRowToReport);
}

export async function getAiReport(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<AiReport | null> {
  const rows = await db.getAllAsync<AiReportRow>(AI_REPORT_QUERIES.selectById, [
    id,
  ]);

  return rows.length > 0 ? mapRowToReport(rows[0]) : null;
}

export async function togglePinReport(
  db: SQLite.SQLiteDatabase,
  id: string,
  pinned: boolean,
): Promise<void> {
  await db.runAsync(AI_REPORT_QUERIES.updatePinned, [pinned ? 1 : 0, id]);
}

export async function deleteAiReport(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(AI_REPORT_QUERIES.deleteById, [id]);
}

async function cleanupOldReports(db: SQLite.SQLiteDatabase) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  await db.runAsync(AI_REPORT_QUERIES.deleteExpired, [cutoff]);
}

async function trimExcessReports(db: SQLite.SQLiteDatabase) {
  // Удаляем незакреплённые отчёты сверх лимита
  await db.runAsync(AI_REPORT_QUERIES.trimExcess, [MAX_REPORTS - 5]); // резервируем 5 мест для закреплённых
}

function mapRowToReport(row: AiReportRow): AiReport {
  return {
    id: row.id,
    action: row.action as AiActionType,
    createdAt: row.createdAt,
    snapshot: JSON.parse(row.snapshot) as AiReportSnapshot,
    response: JSON.parse(row.response) as AiResult,
    pinned: row.pinned === 1,
  };
}
