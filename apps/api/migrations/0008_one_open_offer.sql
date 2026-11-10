CREATE UNIQUE INDEX IF NOT EXISTS dispatch_one_open_offer ON booking.dispatch_offer (booking_id) WHERE status = 'offered';
