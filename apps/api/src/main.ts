import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ZodFilter } from "./zod.filter";

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), { logger: ["error", "warn"] });
  app.useGlobalFilters(new ZodFilter());
  return app;
}

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
  console.log(`hawma-api listening on ${process.env.PORT ?? 3001}`);
}
