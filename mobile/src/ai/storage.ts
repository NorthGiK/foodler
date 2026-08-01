import * as SQLite from 'expo-sqlite';
import { AiReport, AiActionType, AiReportSnapshot, AiResult } from './types';

const AI_DB_NAME = 'food_spend_tracker.db';

const MAX_REPORTS = 30;
const MAX_AGE_DAYS = 30;

export async function initAiReportsTable(db: SQLite.SQLiteDatabase) {
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS ai_reports (
            id TEXT PRIMARY KEY NOT NULL,
            action TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            snapshot TEXT NOT NULL,
            response TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0
        );
    `);

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
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action,
        createdAt: Date.now(),
        snapshot,
        response,
        pinned: false,
    };

    await db.runAsync(
        `INSERT INTO ai_reports (id, action, createdAt, snapshot, response, pinned)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            report.id,
            report.action,
            report.createdAt,
            JSON.stringify(report.snapshot),
            JSON.stringify(report.response),
            report.pinned ? 1 : 0,
        ]
    );

    // Удаляем лишние, если превышен лимит
    await trimExcessReports(db);

    return report;
}

export async function loadAiReports(db: SQLite.SQLiteDatabase): Promise<AiReport[]> {
    const rows = await db.getAllAsync<any>(
        `SELECT id, action, createdAt, snapshot, response, pinned
         FROM ai_reports
         ORDER BY pinned DESC, createdAt DESC
         LIMIT ?`,
        [MAX_REPORTS]
    );

    return rows.map(mapRowToReport);
}

export async function getAiReport(db: SQLite.SQLiteDatabase, id: string): Promise<AiReport | null> {
    const rows = await db.getAllAsync<any>(
        `SELECT id, action, createdAt, snapshot, response, pinned
         FROM ai_reports
         WHERE id = ?`,
        [id]
    );

    return rows.length > 0 ? mapRowToReport(rows[0]) : null;
}

export async function togglePinReport(db: SQLite.SQLiteDatabase, id: string, pinned: boolean): Promise<void> {
    await db.runAsync(
        `UPDATE ai_reports SET pinned = ? WHERE id = ?`,
        [pinned ? 1 : 0, id]
    );
}

export async function deleteAiReport(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(
        `DELETE FROM ai_reports WHERE id = ?`,
        [id]
    );
}

async function cleanupOldReports(db: SQLite.SQLiteDatabase) {
    const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    await db.runAsync(
        `DELETE FROM ai_reports WHERE pinned = 0 AND createdAt < ?`,
        [cutoff]
    );
}

async function trimExcessReports(db: SQLite.SQLiteDatabase) {
    // Удаляем незакреплённые отчёты сверх лимита
    await db.runAsync(`
        DELETE FROM ai_reports
        WHERE pinned = 0 AND id NOT IN (
            SELECT id FROM ai_reports
            WHERE pinned = 0
            ORDER BY createdAt DESC
            LIMIT ?
        )
    `, [MAX_REPORTS - 5]); // резервируем 5 мест для закреплённых
}

function mapRowToReport(row: any): AiReport {
    return {
        id: row.id,
        action: row.action as AiActionType,
        createdAt: row.createdAt,
        snapshot: JSON.parse(row.snapshot) as AiReportSnapshot,
        response: JSON.parse(row.response) as AiResult,
        pinned: row.pinned === 1,
    };
}