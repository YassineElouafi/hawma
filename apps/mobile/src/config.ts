/** Pilot API. Override at build time with EXPO_PUBLIC_API_URL. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://hawma.13.140.210.250.sslip.io/api";
export const WS_URL = API_URL.replace(/^http/, "ws").replace(/\/api$/, "/api/ws");
export const DEFAULT_CENTER = { lat: 33.5883, lng: -7.635 }; // Maarif, Casablanca
