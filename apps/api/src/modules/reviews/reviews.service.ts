import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { BookingsService, type BookingRepo } from "../bookings/bookings.service";

export interface Review { id: string; bookingId: string; authorId: string; subjectId: string; rating: number; comment?: string; createdAt: string }
export interface ReviewRepo {
  create(r: Omit<Review, "id" | "createdAt">): Promise<Review>;            // throws ConflictException if the author already reviewed this booking
  forSubject(subjectId: string, limit: number): Promise<Review[]>;
  forBooking(bookingId: string): Promise<Review[]>;
}
/** Keeps provider_profile.rating_avg / jobs_completed in sync (derived from reviews and confirmed bookings). */
export interface ProviderStatsSink { refresh(providerId: string): Promise<void> }

export class MemoryReviewRepo implements ReviewRepo {
  items: Review[] = [];
  async create(r: Omit<Review, "id" | "createdAt">) {
    if (this.items.some((x) => x.bookingId === r.bookingId && x.authorId === r.authorId)) throw new ConflictException("you already reviewed this booking");
    const v = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; this.items.push(v); return v;
  }
  async forSubject(id: string, limit: number) { return this.items.filter((x) => x.subjectId === id).slice(-limit).reverse(); }
  async forBooking(id: string) { return this.items.filter((x) => x.bookingId === id); }
}

const REVIEWABLE = ["Completed", "Confirmed", "Settled"];

@Injectable()
export class ReviewsService {
  constructor(@Inject("REVIEW_REPO") private repo: ReviewRepo, @Inject("BOOKING_REPO") private bookings: BookingRepo, @Inject("STATS_SINK") private sink: ProviderStatsSink, @Inject(BookingsService) bookingsSvc?: BookingsService) { if (bookingsSvc) bookingsSvc.onConfirmed = (p) => this.onConfirmed(p); }

  async rate(userId: string, bookingId: string, rating: number, comment?: string) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new UnprocessableEntityException("rating must be 1 to 5");
    const b = await this.bookings.get(bookingId);
    if (!b) throw new NotFoundException();
    const subjectId = b.customerId === userId ? b.providerId : b.providerId === userId ? b.customerId : undefined;
    if (b.customerId !== userId && b.providerId !== userId) throw new ForbiddenException("only the customer or provider can review");
    if (!subjectId) throw new UnprocessableEntityException("booking has no counterpart to review yet");
    if (!REVIEWABLE.includes(b.state)) throw new UnprocessableEntityException("reviews open once the job is completed");
    const review = await this.repo.create({ bookingId, authorId: userId, subjectId, rating, comment: comment?.trim() || undefined });
    if (b.providerId === subjectId) await this.sink.refresh(subjectId);
    return review;
  }

  /** Called after a booking is confirmed so job counts stay current. */
  async onConfirmed(providerId: string | null) { if (providerId) await this.sink.refresh(providerId); }
  forProvider(providerId: string, limit = 20) { return this.repo.forSubject(providerId, limit); }
  forBooking(bookingId: string) { return this.repo.forBooking(bookingId); }
}
