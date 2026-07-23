// Maps the F1 driver "nationality" adjective (as stored in drivers.nationality)
// to an ISO 3166-1 alpha-2 country code, for use with flagcdn.com.
// Covers every nationality that appears across F1 history (1950-present).
export const NATIONALITY_FLAG_CODES: Record<string, string> = {
  American: "us",
  Argentine: "ar",
  Argentinian: "ar", // alternate spelling seen in some datasets
  Australian: "au",
  Austrian: "at",
  Belgian: "be",
  Brazilian: "br",
  British: "gb",
  Canadian: "ca",
  Chilean: "cl",
  Chinese: "cn",
  Colombian: "co",
  Czech: "cz",
  Danish: "dk",
  Dutch: "nl",
  "East German": "de", // historical; DDR has no current ISO code
  Finnish: "fi",
  French: "fr",
  German: "de",
  "Hong Kong": "hk",
  Hungarian: "hu",
  Indian: "in",
  Indonesian: "id",
  Irish: "ie",
  Italian: "it",
  Japanese: "jp",
  Liechtensteiner: "li",
  Malaysian: "my",
  Mexican: "mx",
  Monegasque: "mc",
  "New Zealander": "nz",
  Polish: "pl",
  Portuguese: "pt",
  Rhodesian: "zw", // historical; modern territory is Zimbabwe
  Russian: "ru",
  "South African": "za",
  Spanish: "es",
  Swedish: "se",
  Swiss: "ch",
  Thai: "th",
  Uruguayan: "uy",
  Venezuelan: "ve",
};

/**
 * Returns the flagcdn.com flag image URL for a driver's nationality, or null
 * if the nationality isn't recognised (so the caller can omit the flag).
 */
export function nationalityFlagUrl(
  nationality: string | null | undefined,
  size: "w20" | "w40" | "w80" = "w20"
): string | null {
  if (!nationality) return null;
  const code = NATIONALITY_FLAG_CODES[nationality];
  if (!code) return null;
  return `https://flagcdn.com/${size}/${code}.png`;
}
