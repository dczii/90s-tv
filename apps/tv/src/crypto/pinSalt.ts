import * as Crypto from "expo-crypto";
import { PIN_SALT_LENGTH } from "@littleplay/core";

export async function randomPinSalt(): Promise<Uint8Array> {
  const bytes = await Crypto.getRandomBytesAsync(PIN_SALT_LENGTH);
  return new Uint8Array(bytes);
}
