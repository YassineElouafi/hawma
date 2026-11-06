import { test, expect } from "@playwright/test";

test("landing", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-top.png` });
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-full.png`, fullPage: true });
  await page.getByRole("button", { name: "العربية" }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshots/${info.project.name}-landing-ar.png` });
  expect(errors).toEqual([]);
});

test("app flow", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app");
  await page.screenshot({ path: `screenshots/${info.project.name}-app-1-onboarding.png` });
  await page.getByRole("button", { name: /Commencer/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-2-home.png` });
  await page.getByText("Ménage & repassage").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-3-detail.png` });
  await page.getByRole("button", { name: /Réserver/ }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder("Écrire un message…").fill("Salam, dispo demain ?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-4-chat.png` });
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Carte" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-5-map.png` });
  await page.getByRole("button", { name: "Publier" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-6-post.png` });
  await page.getByRole("button", { name: "Profil" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/${info.project.name}-app-7-profile.png` });
  expect(errors).toEqual([]);
});
