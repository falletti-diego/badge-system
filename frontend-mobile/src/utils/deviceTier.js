import * as Device from 'expo-device';

// Soglia "Android Go"/fascia bassa: stesso segnale usato dall'industria per il
// targeting di device economici. Su iOS Device.totalMemory è sempre null —
// fail-open verso `false` (comportamento identico a oggi), mai un falso
// positivo che peggiori l'esperienza su un device che non lo merita.
export const LOW_END_RAM_THRESHOLD_BYTES = 3 * 1024 ** 3; // 3GB

export function isLowEndDevice() {
  try {
    const totalMemory = Device.totalMemory;
    if (typeof totalMemory !== 'number' || totalMemory <= 0) return false;
    return totalMemory <= LOW_END_RAM_THRESHOLD_BYTES;
  } catch (err) {
    console.warn('[deviceTier] isLowEndDevice() failed, defaulting to false:', err.message);
    return false;
  }
}
