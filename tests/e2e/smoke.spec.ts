import { test, expect } from "@playwright/test";

test("loads, imports an mdrone link, and toggles play", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "mraga" })).toBeVisible();

  // Build a real ?b= mdrone link for a D / maqam-rast scene.
  const scene = { version: 1, name: "e2e", drone: { root: "D", octave: 4, tuningId: "maqam-rast" } };
  const json = Buffer.from(JSON.stringify(scene), "utf8");
  const b64 = json.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const link = `https://app.mdrone.org/?b=${b64}`;

  await page.getByLabel("mdrone link").fill(link);
  await page.getByLabel("mdrone link").blur();
  await expect(page.getByText(/linked: D/)).toBeVisible();

  await page.getByRole("button", { name: /PLAY/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible();
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(page.getByRole("button", { name: /PLAY/ })).toBeVisible();
});
