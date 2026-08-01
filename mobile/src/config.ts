// Expo embeds EXPO_PUBLIC_* values into the application bundle. Never put
// secrets here: the base URL is public configuration.
const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(
  /\/+$/,
  "",
);
if (!configuredApiBase && !__DEV__) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required in production builds");
}
export const API_BASE = configuredApiBase ?? "http://10.0.2.2:8000/api";

// Ссылки на документы
const BASE_POLICY_URL = "https://foodler.site/legal";
export const SUBSCRIPTION_TERMS = `${BASE_POLICY_URL}/subscription_terms.html`;

export const policy = {
  PRIVACY_POLICY: `${BASE_POLICY_URL}/privacy_policy.html`,
  TERMS_OF_SERVICE: `${BASE_POLICY_URL}/terms_of_service.html`,
  CONSENT_TO_THE_PROCESSING_OF_PERSONAL_DATA: `${BASE_POLICY_URL}/consent_to_the_processing_of_personal_data.html`,
  CONSENT_TO_THE_PROCESSING_OF_SPECIAL_CATEGORIES_OF_PERSONAL_DATA: `${BASE_POLICY_URL}/consent_to_the_processing_of_special_categories_of_personal_data.html`,
} as const;
