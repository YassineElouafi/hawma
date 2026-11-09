import { defineConfig } from "vitest/config";
export default defineConfig({ test: { env: { OTP_IP_LIMIT: "1000" } } });
