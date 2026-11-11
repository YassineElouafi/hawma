import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function scan(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const lines = r.violations.map((v) => `${v.id} [${v.impact}] ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  console.log(`A11Y ${name}: ${lines.length ? "\n  " + lines.join("\n  ") : "no violations"}`);
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.skip(({ browserName }, info) => info.project.name !== "desktop", "desktop only");

test("landing page (fr, rtl ar)", async ({ page }) => {
  await page.goto("/"); await page.waitForTimeout(1500);
  const fr = await scan(page, "landing-fr");
  await page.getByRole("button", { name: "العربية" }).first().click(); await page.waitForTimeout(500);
  const ar = await scan(page, "landing-ar");
  expect([...fr, ...ar].map((v) => v.id)).toEqual([]);
});

test("web app login + home", async ({ page }) => {
  await page.route("**/api/v1/search**", (r) => r.fulfill({ json: [{ id: "o1", title: "Ménage & repassage", categoryId: "cleaning", priceCentimes: 12000, distanceM: 500, rating: 4.9, jobs: 41, tier: 2, availableThisWeek: true, providerId: "p1" }] }));
  await page.route("**/api/v1/auth/otp/request", (r) => r.fulfill({ json: { sent: true, devCode: "123456" } }));
  await page.route("**/api/v1/auth/otp/verify", (r) => r.fulfill({ json: { userId: "u1", accessToken: "a", refreshToken: "r".repeat(30) } }));
  await page.route("**/api/v1/bookings", (r) => r.fulfill({ json: [] }));
  await page.goto("/app");
  const login = await scan(page, "app-login");
  await page.getByLabel(/Numéro de téléphone/).fill("0611223344"); await page.getByRole("button", { name: "Recevoir le code" }).click(); await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Ménage & repassage")).toBeVisible();
  const home = await scan(page, "app-home");
  expect([...login, ...home].map((v) => v.id)).toEqual([]);
});

test("ops login + overview", async ({ page }) => {
  await page.route("**/api/ops/login", (r) => r.fulfill({ json: { token: "t" } }));
  await page.route("**/api/ops/me", (r) => r.fulfill({ json: { id: "s1", email: "admin@hawma.ma", roles: ["admin"] } }));
  await page.route("**/api/ops/stats", (r) => r.fulfill({ json: { total: 12, byState: { Settled: 8, Requested: 4 }, gmvCentimes: 100000, feesCentimes: 15000, perDay: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, count: i, gmvCentimes: i * 1000 })), active: 2, pendingKyc: 1, fillRate: 0.8 } }));
  await page.route("**/api/ops/finance", (r) => r.fulfill({ json: { platformRevenue: 1000, cashHeld: 5000, earnings: 4000 } }));
  await page.route("**/api/ops/kyc", (r) => r.fulfill({ json: [] }));
  await page.route(/\/api\/ops\/bookings(\?.*)?$/, (r) => r.fulfill({ json: [{ id: "b3333333-0000", state: "Accepted", mode: "dispatch", customerId: "c4444444-0000", providerId: null, totalCentimes: 12000, feeCentimes: 1800, paymentMethod: "cash" }] }));
  await page.goto("/ops");
  const login = await scan(page, "ops-login");
  await page.getByLabel("Email").fill("admin@hawma.ma"); await page.getByLabel("Password").fill("correct-password"); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible(); await page.waitForTimeout(1500);
  const overview = await scan(page, "ops-overview");
  expect([...login, ...overview].map((v) => v.id)).toEqual([]);
});
