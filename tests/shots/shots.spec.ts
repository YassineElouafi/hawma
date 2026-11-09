import { test, expect } from "@playwright/test";

test("landing", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-top.png` });
  for (let y = 0; y < 9000; y += 500) { await page.mouse.wheel(0, 500); await page.waitForTimeout(120); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-full.png`, fullPage: true });
  await page.getByRole("button", { name: "العربية" }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-ar.png` });
  expect(errors).toEqual([]);
});

test("web app flow against a mocked API", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  const hits = [
    { id: "o1", title: "Ménage & repassage", categoryId: "cleaning", priceCentimes: 12000, distanceM: 500, rating: 4.9, jobs: 41, tier: 2, availableThisWeek: true, providerId: "p1" },
    { id: "o2", title: "Maths lycée / bac", categoryId: "tutoring", priceCentimes: 10000, distanceM: 700, rating: 4.8, jobs: 27, tier: 1, availableThisWeek: true, providerId: "p2" },
    { id: "o3", title: "Plomberie & électricité", categoryId: "diy", priceCentimes: 15000, distanceM: 1100, rating: 4.6, jobs: 18, tier: 2, availableThisWeek: false, providerId: "p3" },
  ];
  let bookings: unknown[] = [];
  await page.route("**/api/v1/auth/otp/request", (r) => r.fulfill({ json: { sent: true, expiresInS: 300, devCode: "123456" } }));
  await page.route("**/api/v1/auth/otp/verify", (r) => r.request().postDataJSON().code === "123456" ? r.fulfill({ json: { userId: "u1", accessToken: "a", refreshToken: "r".repeat(30) } }) : r.fulfill({ status: 401, contentType: "application/problem+json", json: { title: "wrong code" } }));
  await page.route("**/api/v1/search**", (r) => r.fulfill({ json: hits }));
  await page.route("**/api/v1/bookings", (r) => { if (r.request().method() === "POST") { bookings = [{ id: "b1111111-0000", state: "Requested", providerId: "p1", customerId: "u1", totalCentimes: 12000, paymentMethod: "cash" }]; return r.fulfill({ status: 201, json: bookings[0] }); } return r.fulfill({ json: bookings }); });
  await page.route("**/api/v1/me", (r) => r.fulfill({ json: { id: "u1", phone: "+212611223344" } }));

  await page.goto("/app");
  await page.screenshot({ path: `screenshots/${info.project.name}-app-1-login.png` });
  await page.getByLabel(/Numéro de téléphone/).fill("0611223344");
  await page.getByRole("button", { name: "Recevoir le code" }).click();
  await expect(page.getByText(/Code de test/)).toBeVisible();
  await page.screenshot({ path: `screenshots/${info.project.name}-app-2-code.png` });
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByText("Ménage & repassage")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-3-home.png` });
  await page.getByText("Ménage & repassage").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-4-detail.png` });
  await page.getByRole("button", { name: "Réserver" }).click();
  await expect(page.getByText("Demande envoyée")).toBeVisible();
  await page.getByRole("button", { name: "Réservations" }).click();
  await expect(page.getByText("Aucune réservation en cours")).toHaveCount(0);
  await expect(page.getByText("En attente")).toBeVisible();
  await page.screenshot({ path: `screenshots/${info.project.name}-app-5-bookings.png` });
  await page.getByRole("button", { name: "Profil" }).click();
  await expect(page.getByText("+212611223344")).toBeVisible();
  await page.getByRole("button", { name: "العربية" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-6-profile-ar.png` });
  expect(errors).toEqual([]);
});
