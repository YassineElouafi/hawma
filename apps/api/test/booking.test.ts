import { describe, expect, it } from "vitest";
import { allowedCommands, BOOKING_STATES, COMMANDS, IllegalTransition, TERMINAL, transition, type BookingState } from "../src/domain/booking";

const b = (state: BookingState, mode: "catalogue" | "dispatch" | "quote" = "catalogue") => ({ state, mode });

describe("booking state machine", () => {
  it("walks the happy path in catalogue mode", () => {
    let s: BookingState = "Requested";
    const steps: [Parameters<typeof transition>[1], Parameters<typeof transition>[2]][] = [
      ["accept", "provider"], ["start_trip", "provider"], ["arrive", "provider"], ["start_job", "provider"],
      ["complete", "provider"], ["confirm", "customer"], ["settle", "system"],
    ];
    for (const [c, a] of steps) s = transition(b(s), c, a).state;
    expect(s).toBe("Settled");
  });

  it("supports dispatch: offer then accept, and expiry", () => {
    const o = transition(b("Requested", "dispatch"), "offer", "system");
    expect(o.state).toBe("Offered");
    expect(transition(b("Offered", "dispatch"), "accept", "provider").state).toBe("Accepted");
    expect(transition(b("Offered", "dispatch"), "expire", "system").state).toBe("Expired");
  });

  it("forbids offers outside dispatch mode", () => {
    expect(() => transition(b("Requested", "catalogue"), "offer", "system")).toThrow(IllegalTransition);
  });

  it("only the right actor may act", () => {
    expect(() => transition(b("Requested"), "accept", "customer")).toThrow(/not allowed/);
    expect(() => transition(b("Completed"), "confirm", "provider")).toThrow(/not allowed/);
    expect(() => transition(b("Completed"), "dispute", "provider")).toThrow(IllegalTransition);
  });

  it("terminal states accept nothing", () => {
    for (const s of TERMINAL) for (const c of COMMANDS) for (const a of ["customer", "provider", "system", "ops"] as const)
      expect(() => transition(b(s, "dispatch"), c, a)).toThrow(IllegalTransition);
  });

  it("cannot skip steps", () => {
    expect(() => transition(b("Accepted"), "complete", "provider")).toThrow(IllegalTransition);
    expect(() => transition(b("Requested"), "start_job", "provider")).toThrow(IllegalTransition);
  });

  it("customer can dispute completed work; ops can then refund or settle", () => {
    const d = transition(b("Completed"), "dispute", "customer").state;
    expect(d).toBe("Disputed");
    expect(transition(b(d), "refund", "ops").state).toBe("Refunded");
    expect(transition(b(d), "settle", "ops").state).toBe("Settled");
  });

  it("emits a typed event", () => {
    const { event } = transition(b("Requested"), "accept", "provider", new Date("2026-11-07T10:00:00Z"));
    expect(event).toMatchObject({ type: "booking.accepted", from: "Requested", to: "Accepted", actor: "provider", at: "2026-11-07T10:00:00.000Z" });
  });

  it("allowedCommands drives UI", () => {
    expect(allowedCommands(b("Requested"), "provider").sort()).toEqual(["accept", "cancel", "decline"]);
    expect(allowedCommands(b("Requested"), "customer")).toEqual(["cancel"]);
    expect(allowedCommands(b("Settled"), "ops")).toEqual([]);
  });

  it("every non-terminal state has a way forward for someone", () => {
    for (const s of BOOKING_STATES.filter((x) => !TERMINAL.includes(x)))
      expect(["customer", "provider", "system", "ops"].some((a) => allowedCommands(b(s, "dispatch"), a as never).length > 0), s).toBe(true);
  });
});
