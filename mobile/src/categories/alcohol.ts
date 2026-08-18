import type { CategoryRule } from "./types";

export const rule: CategoryRule = {
  category: "Алкоголь",
  patterns: [
    /пиво/i,
    /вин[оа]/i,
    /водк/i,
    /виски/i,
    /коньяк/i,
    /сидр/i,
    /шампан/i,
  ],
};
