/**
 * Booking aggregate — pure state machine (docs/architecture/03-domain-model §3.3).
 * No I/O: callers persist the returned event and publish it through the outbox.
 */
export const BOOKING_STATES = [
  "Requested", "Offered", "Accepted", "EnRoute", "Arrived", "InProgress", "Completed",
  "Confirmed", "Disputed", "Settled", "Refunded", "Declined", "Expired", "Cancelled",
] as const;
export type BookingState = (typeof BOOKING_STATES)[number];

export const COMMANDS = [
  "offer", "accept", "decline", "expire", "start_trip", "arrive", "start_job",
  "complete", "confirm", "dispute", "settle", "refund", "cancel",
] as const;
export type Command = (typeof COMMANDS)[number];
export type Actor = "customer" | "provider" | "system" | "ops";
export type Mode = "catalogue" | "dispatch" | "quote";

interface Rule { from: BookingState[]; to: BookingState; actors: Actor[]; modes?: Mode[] }

const RULES: Record<Command, Rule> = {
  offer:      { from: ["Requested"], to: "Offered", actors: ["system"], modes: ["dispatch"] },
  accept:     { from: ["Requested", "Offered"], to: "Accepted", actors: ["provider", "ops"] },
  decline:    { from: ["Requested"], to: "Declined", actors: ["provider"] },
  expire:     { from: ["Offered", "Requested"], to: "Expired", actors: ["system"] },
  start_trip: { from: ["Accepted"], to: "EnRoute", actors: ["provider"] },
  arrive:     { from: ["EnRoute"], to: "Arrived", actors: ["provider", "system"] },
  start_job:  { from: ["Arrived"], to: "InProgress", actors: ["provider"] },
  complete:   { from: ["InProgress"], to: "Completed", actors: ["provider"] },
  confirm:    { from: ["Completed"], to: "Confirmed", actors: ["customer", "system"] },
  dispute:    { from: ["Completed"], to: "Disputed", actors: ["customer"] },
  settle:     { from: ["Confirmed", "Disputed"], to: "Settled", actors: ["system", "ops"] },
  refund:     { from: ["Disputed", "Confirmed"], to: "Refunded", actors: ["ops", "system"] },
  cancel:     { from: ["Requested", "Offered", "Accepted"], to: "Cancelled", actors: ["customer", "provider", "ops"] },
};

export const TERMINAL: BookingState[] = ["Settled", "Refunded", "Declined", "Expired", "Cancelled"];

export interface BookingEvent { type: `booking.${string}`; from: BookingState; to: BookingState; command: Command | "reschedule"; actor: Actor; at: string }

export class IllegalTransition extends Error {
  constructor(public command: Command, public state: BookingState, reason: string) {
    super(`Cannot ${command} from ${state}: ${reason}`);
  }
}

export interface BookingLike { state: BookingState; mode: Mode }

export function transition(b: BookingLike, command: Command, actor: Actor, now = new Date()): { state: BookingState; event: BookingEvent } {
  const r = RULES[command];
  if (TERMINAL.includes(b.state)) throw new IllegalTransition(command, b.state, "booking is finished");
  if (!r.from.includes(b.state)) throw new IllegalTransition(command, b.state, `allowed from ${r.from.join("/")}`);
  if (!r.actors.includes(actor)) throw new IllegalTransition(command, b.state, `actor ${actor} not allowed`);
  if (r.modes && !r.modes.includes(b.mode)) throw new IllegalTransition(command, b.state, `not available in ${b.mode} mode`);
  if (command === "accept" && b.state === "Offered" && b.mode !== "dispatch") throw new IllegalTransition(command, b.state, "offers exist only in dispatch mode");
  return { state: r.to, event: { type: `booking.${r.to.toLowerCase()}`, from: b.state, to: r.to, command, actor, at: now.toISOString() } };
}

/** Commands an actor may issue right now (drives UI buttons and API validation). */
export const allowedCommands = (b: BookingLike, actor: Actor): Command[] =>
  COMMANDS.filter((c) => { try { transition(b, c, actor); return true; } catch { return false; } });
