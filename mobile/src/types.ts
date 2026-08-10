export interface ApiReceiptResponse {
  code: number;
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
      }[];
    };
  };
  request?: {
    qrraw: string;
  };
}

export interface FamilyMember {
  name: string;
  age: number;
  gender: "male" | "female";
  heightCm: number;
  weightKg: number;
  dietaryPreferences: string[];
  healthGoals: string[];
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
  dietaryPreferences: [],
  healthGoals: [],
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
}

export type Period = "day" | "week" | "month" | "year";
export type CategoryMode = "sum" | "count";
