// Maps circuits.country (a country NAME, e.g. "Monaco", "UK") to an ISO
// 3166-1 alpha-2 code for flagcdn.com.
//
// This is deliberately separate from lib/nationality-flags.ts: that one maps
// nationality ADJECTIVES ("British", "Monegasque"). The circuits table stores
// country names, and a few of them are dataset-specific spellings ("UK",
// "USA", "Korea") rather than ISO short names.
//
// Covers every distinct value of circuits.country across the 78 rows.

export const COUNTRY_FLAG_CODES: Record<string, string> = {
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Azerbaijan: "az",
  Bahrain: "bh",
  Belgium: "be",
  Brazil: "br",
  Canada: "ca",
  China: "cn",
  France: "fr",
  Germany: "de",
  Hungary: "hu",
  India: "in",
  Italy: "it",
  Japan: "jp",
  Korea: "kr",
  Malaysia: "my",
  Mexico: "mx",
  Monaco: "mc",
  Morocco: "ma",
  Netherlands: "nl",
  Portugal: "pt",
  Qatar: "qa",
  Russia: "ru",
  "Saudi Arabia": "sa",
  Singapore: "sg",
  "South Africa": "za",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Turkey: "tr",
  UAE: "ae",
  UK: "gb",
  USA: "us",
  "United States": "us",
};

/** flagcdn URL for a circuit country, or null when unmapped. */
export function countryFlagUrl(
  country: string | null | undefined,
  width: 20 | 40 | 80 = 20
): string | null {
  if (!country) return null;
  const code = COUNTRY_FLAG_CODES[country.trim()];
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code}.png`;
}
