export const AI_REPORT_QUERIES = {
  createTable: `
    CREATE TABLE IF NOT EXISTS ai_reports (
      id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      response TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0
    );
  `,
  insert: `
    INSERT INTO ai_reports (id, action, createdAt, snapshot, response, pinned)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  selectAll: `
    SELECT id, action, createdAt, snapshot, response, pinned
    FROM ai_reports
    ORDER BY pinned DESC, createdAt DESC
    LIMIT ?
  `,
  selectById: `
    SELECT id, action, createdAt, snapshot, response, pinned
    FROM ai_reports
    WHERE id = ?
  `,
  updatePinned: "UPDATE ai_reports SET pinned = ? WHERE id = ?",
  deleteById: "DELETE FROM ai_reports WHERE id = ?",
  deleteExpired: "DELETE FROM ai_reports WHERE pinned = 0 AND createdAt < ?",
  trimExcess: `
    DELETE FROM ai_reports
    WHERE pinned = 0 AND id NOT IN (
      SELECT id FROM ai_reports
      WHERE pinned = 0
      ORDER BY createdAt DESC
      LIMIT ?
    )
  `,
} as const;
