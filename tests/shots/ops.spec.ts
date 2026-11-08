import { test, expect } from "@playwright/test";

const kyc = [{ id: "k1111111-0000-0000-0000-000000000000", userId: "u2222222-0000-0000-0000-000000000000", tier: 2, status: "in_review", documents: ["cin_front", "cin_back", "selfie"], createdAt: "2026-11-08T10:00:00Z" }];
const booking = { id: "b3333333-0000-0000-0000-000000000000", state: "Accepted", mode: "dispatch", customerId: "c4444444-0000-0000-0000-000000000000", providerId: "p5555555-0000-0000-0000-000000000000", totalCentimes: 12000, feeCentimes: 1800, paymentMethod: "cash", events: [{ type: "booking.accepted", actor: "provider", at: "2026-11-08T10:05:00Z" }] };

test("ops console flow against a mocked API", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop only");
  const decisions: string[] = [];
  await page.route("**/api/ops/login", (r) => r.request().postDataJSON().password === "correct-password" ? r.fulfill({ json: { token: "t" } }) : r.fulfill({ status: 401, contentType: "application/problem+json", json: { title: "invalid credentials" } }));
  await page.route("**/api/ops/me", (r) => r.fulfill({ json: { id: "s1", email: "admin@hawma.ma", roles: ["admin"] } }));
  await page.route("**/api/ops/kyc", (r) => r.fulfill({ json: kyc }));
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

  await expect(page.getByRole("heading", { name: "Verification queue" })).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-2-kyc.png" });
  await page.getByRole("button", { name: "Review" }).click();
  const approve = page.getByRole("button", { name: "Approve" });
  await expect(approve).toBeDisabled();                                   // reason required
  await page.getByLabel(/Reason/).fill("documents match the applicant");
  await expect(approve).toBeEnabled();
  await page.screenshot({ path: "screenshots/ops-3-review.png" });
  await approve.click();
  expect(decisions).toEqual(["documents match the applicant"]);

  await page.getByRole("button", { name: "Bookings" }).first().click();
  await page.getByText("b3333333").click();
  await expect(page.getByText("Timeline")).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-4-booking.png" });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Audit log" }).first().click();
  await expect(page.getByText("kyc.approved")).toBeVisible();
  await page.screenshot({ path: "screenshots/ops-5-audit.png" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
