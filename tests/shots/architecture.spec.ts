import { test, expect } from "@playwright/test";

const slugs = ["00-README", "01-product-and-scope", "02-system-architecture", "03-domain-model", "04-backend-modules", "05-flows", "06-data-and-realtime", "07-clients", "08-infra-devops", "09-security-trust-compliance", "10-roadmap-adrs", "11-implementation-status"];

for (const slug of slugs) {
  test(`architecture ${slug}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop only");
    await page.goto(`/architecture#${slug}`);
    await page.waitForFunction((s) => document.body.dataset.rendered === s, slug, { timeout: 60_000 });
    const bad = await page.locator('.diagram[data-ok="0"] .mermaid-error').allTextContents();
    expect(bad, `diagram errors in ${slug}`).toEqual([]);
    expect(await page.locator(".diagram[data-ok='1']").count()).toBeGreaterThan(0);
    await page.screenshot({ path: `screenshots/arch-${slug}.png`, fullPage: true });
  });
}
