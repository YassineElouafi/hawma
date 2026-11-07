import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("healthz") health() { return { status: "ok", service: "hawma-api", time: new Date().toISOString() }; }
}
