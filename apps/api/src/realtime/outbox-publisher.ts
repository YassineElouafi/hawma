import type { Bus } from "./bus";
import type { Publisher } from "../modules/bookings/outbox.relay";

/** Outbox relay target: pushes booking events to the booking channel and to both parties' personal channels. */
export class BusPublisher implements Publisher {
  constructor(private bus: Bus, private parties: (bookingId: string) => Promise<string[]>) {}
  async publish(type: string, eventId: string, payload: unknown) {
    const p = payload as { bookingId?: string };
    const msg = { type, eventId, ...(payload as object) };
    if (p.bookingId) {
      await this.bus.publish(`booking:${p.bookingId}`, msg);
      for (const u of await this.parties(p.bookingId)) await this.bus.publish(`user:${u}`, msg);
    }
  }
}
