import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import { ZodError } from "zod";

/** RFC 7807 problem+json for validation and HTTP errors. */
@Catch()
export class ZodFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500, title = "Internal Server Error", extra: Record<string, unknown> = {};
    if (e instanceof ZodError) { status = 400; title = "Validation failed"; extra = { errors: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }; }
    else if (e instanceof HttpException) { status = e.getStatus(); title = String((e.getResponse() as { message?: string })?.message ?? e.message); }
    res.status(status).header("content-type", "application/problem+json").send({ type: "about:blank", title, status, ...extra });
  }
}
