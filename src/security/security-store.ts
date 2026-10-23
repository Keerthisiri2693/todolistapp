
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const CONFIG_KEY = "notes.security.config.v1";
const LOCKED_NOTES_KEY = "notes.security.locked-ids.v1";

export type SecurityConfig = {
  pinSalt: string;
  pinHash: string;

  // Pattern lock verifier
  patternSalt: string;
  patternHash: string;

  appLockEnabled: boolean;
  biometricEnabled: boolean;
  hidePrivatePreviews: boolean;
  autoLockEnabled: boolean;
};

const DEFAULT_CONFIG: SecurityConfig = {
  pinSalt: "",
  pinHash: "",
  patternSalt: "",
  patternHash: "",
  appLockEnabled: true,
  biometricEnabled: false,
  hidePrivatePreviews: true,
  autoLockEnabled: true,
};

export async function readSecurityConfig(): Promise<SecurityConfig> {
  try {
    const raw = await SecureStore.getItemAsync(CONFIG_KEY);

    if (!raw) {
      return { ...DEFAULT_CONFIG };
    }

    const parsed = JSON.parse(raw) as Partial<SecurityConfig>;

    // Defaults preserve compatibility with existing saved configurations.
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      patternSalt: parsed.patternSalt ?? "",
      patternHash: parsed.patternHash ?? "",
    };
  } catch (error) {
    console.warn("Unable to read security settings:", error);
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeSecurityConfig(
  config: SecurityConfig
): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createVerifier(
  value: string,
  salt?: string
): Promise<{ salt: string; hash: string }> {
  const actualSalt =
    salt ?? bytesToHex(await Crypto.getRandomBytesAsync(16));

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${actualSalt}:${value}`
  );

  return { salt: actualSalt, hash };
}

// PIN

export async function createPinVerifier(
  pin: string,
  salt?: string
): Promise<{ salt: string; hash: string }> {
  return createVerifier(pin, salt);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const config = await readSecurityConfig();

  if (!config.pinHash || !config.pinSalt) return false;

  const result = await createPinVerifier(pin, config.pinSalt);

  return result.hash === config.pinHash;
}

export async function saveNewPin(pin: string): Promise<void> {
  if (!/^\d{6,8}$/.test(pin)) {
    throw new Error("PIN must contain 6–8 digits.");
  }

  const result = await createPinVerifier(pin);
  const previous = await readSecurityConfig();

  await writeSecurityConfig({
    ...previous,
    pinSalt: result.salt,
    pinHash: result.hash,
    appLockEnabled: true,
  });
}

// Pattern lock

function normalizePattern(pattern: number[]): string {
  if (
    !Array.isArray(pattern) ||
    pattern.length < 4 ||
    pattern.length > 9 ||
    pattern.some(
      (point) =>
        !Number.isInteger(point) || point < 0 || point > 8
    ) ||
    new Set(pattern).size !== pattern.length
  ) {
    throw new Error(
      "Draw a pattern using at least 4 different dots."
    );
  }

  return pattern.join("-");
}

export async function saveNewPattern(
  pattern: number[]
): Promise<void> {
  const normalized = normalizePattern(pattern);
  const result = await createVerifier(normalized);
  const previous = await readSecurityConfig();

  await writeSecurityConfig({
    ...previous,
    patternSalt: result.salt,
    patternHash: result.hash,
    appLockEnabled: true,
  });
}

export async function verifyPattern(
  pattern: number[]
): Promise<boolean> {
  let normalized: string;

  try {
    normalized = normalizePattern(pattern);
  } catch {
    return false;
  }

  const config = await readSecurityConfig();

  if (!config.patternSalt || !config.patternHash) {
    return false;
  }

  const result = await createVerifier(
    normalized,
    config.patternSalt
  );

  return result.hash === config.patternHash;
}

export async function removePattern(): Promise<void> {
  const previous = await readSecurityConfig();

  await writeSecurityConfig({
    ...previous,
    patternSalt: "",
    patternHash: "",
  });
}

// Locked notes

export async function readLockedNoteIds(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(LOCKED_NOTES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter(
          (id): id is string => typeof id === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export async function writeLockedNoteIds(
  ids: string[]
): Promise<void> {
  await SecureStore.setItemAsync(
    LOCKED_NOTES_KEY,
    JSON.stringify([...new Set(ids)])
  );
}
