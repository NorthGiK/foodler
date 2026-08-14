import type { CategoryRule } from "./types";

export const rule: CategoryRule = {
  category: "прочее",
  patterns: [
    /корм\w*/i,
    /кошач\w*/i,
    /собач\w*/i,
    /kitekat/i,
    /whiskas/i,
    /felix/i,
    /purina/i,
    /royal\s+canin/i,
  ],
};
