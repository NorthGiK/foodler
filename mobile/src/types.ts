export interface ApiReceiptResponse {
  code: number;
  receiptId?: string;
  data?: {
    json?: {
      ticketDate?: string;
      operationType?: number;
      totalSum?: number;
      user?: string;
      dateTime?: string;
      fiscalDriveNumber?: string;
      fiscalDocumentNumber?: string | number;
      fiscalSign?: string | number;
      items?: {
        name?: string;
        price?: number;
        sum?: number;
        quantity?: number;
        gtin?: string;
        category?: string;
        category_source?: string;
        category_confidence?: number;
        category_taxonomy_version?: string;
        category_model_version?: string;
      }[];
    };
  };
  request?: {
    qrraw: string;
  };
}

export type NutritionGoal =
  "balance" | "healthy" | "cheaper" | "lose_weight" | "gain_weight";

export type ActivityLevel = "low" | "medium" | "high";

export interface FamilyMember {
  name: string;
  age: number;
  gender: "male" | "female";
  heightCm: number;
  weightKg: number;
  likedFoods: string[];
  dislikedFoods: string[];
  nutritionGoal: NutritionGoal;
  activityLevel: ActivityLevel;
  additionalInfo?: string;
}

export interface UserProfile extends FamilyMember {
  familySize: number; // можно оставить для совместимости, но основным будет массив
  hasChildren: boolean;
  familyMembers: FamilyMember[];
}

export const defaultProfile: UserProfile = {
  name: "",
  age: 30,
  gender: "male",
  heightCm: 170,
  weightKg: 70,
  familySize: 1,
  hasChildren: false,
  likedFoods: [],
  dislikedFoods: [],
  nutritionGoal: "balance",
  activityLevel: "low",
  familyMembers: [],
};

export type ChartKind = "bar" | "line";

export interface Receipt {
  id: string;
  qrraw: string;
  organization: string;
  ticketDate: string;
  operationType: number;
  totalSumRub: number;
  sourceCode: number;
  status?: number;
}

export interface ReceiptItem {
  id?: number;
  receiptId: string;
  name: string;
  category: string;
  priceRub: number;
  quantity: number;
  sumRub: number;
  categorySource?: string;
  categoryConfidence?: number;
  categoryTaxonomyVersion?: string;
  categoryModelVersion?: string;
}

export type Period = "day" | "week" | "month" | "year";
export type CategoryMode = "sum" | "count";
