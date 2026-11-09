import { test, expect } from "@playwright/test";

const kyc = [{ id: "k1111111-0000-0000-0000-000000000000", userId: "u2222222-0000-0000-0000-000000000000", tier: 2, status: "in_review", documents: ["cin_front", "cin_back", "selfie"], createdAt: "2026-11-08T10:00:00Z" }];
const booking = { id: "b3333333-0000-0000-0000-000000000000", state: "Accepted", mode: "dispatch", customerId: "c4444444-0000-0000-0000-000000000000", providerId: "p5555555-0000-0000-0000-000000000000", totalCentimes: 12000, feeCentimes: 1800, paymentMethod: "cash", events: [{ type: "booking.accepted", actor: "provider", at: "2026-11-08T10:05:00Z" }] };

test("ops console flow against a mocked API", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop only");
  const decisions: string[] = [];
  await page.route("**/api/ops/login", (r) => r.request().postDataJSON().password === "correct-password" ? r.fulfill({ json: { token: "t" } }) : r.fulfill({ status: 401, contentType: "application/problem+json", json: { title: "invalid credentials" } }));
  await page.route("**/api/ops/me", (r) => r.fulfill({ json: { id: "s1", email: "admin@hawma.ma", roles: ["admin"] } }));
  const days = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10), count: [3, 5, 4, 8, 6, 9, 7, 11, 10, 14, 12, 15, 13, 18][i], gmvCentimes: [3, 5, 4, 8, 6, 9, 7, 11, 10, 14, 12, 15, 13, 18][i] * 14000 }));
  await page.route("**/api/ops/stats", (r) => r.fulfill({ json: { total: 126, byState: { Settled: 61, Accepted: 14, Requested: 9, Cancelled: 12, Completed: 22, Disputed: 3, InProgress: 5 }, gmvCentimes: 1_182_000, feesCentimes: 177_300, perDay: days, active: 19, pendingKyc: 1, fillRate: 0.78 } }));
  await page.route("**/api/ops/kyc", (r) => r.fulfill({ json: kyc }));
  const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.route("**/api/ops/kyc/*/documents", (r) => r.fulfill({ json: [{ id: "d1", kind: "cin_front", mime: "image/png", size: 70 }, { id: "d2", kind: "selfie", mime: "image/png", size: 70 }] }));
  await page.route("**/api/ops/documents/*", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG1 }));
  await page.route("**/api/ops/kyc/*/approve", (r) => { decisions.push(r.request().postDataJSON().reason); r.fulfill({ json: { ...kyc[0], status: "approved" } }); });
  await page.route(/\/api\/ops\/bookings(\?.*)?$/, (r) => r.fulfill({ json: [booking] }));
  await page.route("**/api/ops/bookings/*", (r) => r.fulfill({ json: booking }));
  await page.route("**/api/ops/audit", (r) => r.fulfill({ json: [{ id: 1, at: "2026-11-08T10:06:00Z", actorId: "s1000000", action: "kyc.approved", target: "k1111111", reason: "documents match" }] }));

  await page.goto("/ops");
  await page.screenshot({ path: "screenshots/ops-1-login.png" });
  await page.getByLabel("Email").fill("admin@hawma.ma"); await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid credentials");
  await page.getByLabel("Password").fill("correct-password"); await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("126")).toBeVisible();                       // count-up reaches the value
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "screenshots/ops-2a-overview.png" });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("option", { name: /Go to Bookings/ })).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-2b-palette.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "screenshots/ops-2c-dark.png" });
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.getByRole("button", { name: /Verifications/ }).first().click();
  await expect(page.getByRole("heading", { name: "Verification queue" })).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-2-kyc.png" });
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("button", { name: "View cin_front" })).toBeVisible();
  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve).toBeDisabled();                                   // reason required
  await page.getByLabel(/Reason/).fill("documents match the applicant");
  await expect(approve).toBeEnabled();
  await page.screenshot({ path: "screenshots/ops-3-review.png" });
  await approve.click();
  expect(decisions).toEqual(["documents match the applicant"]);

  await page.getByRole("button", { name: "Bookings" }).first().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await page.getByText("b3333333").click();
  await expect(page.getByText("Timeline")).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-4-booking.png" });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Audit log" }).first().click();
  await expect(page.getByText("kyc.approved")).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-5-audit.png" });
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
