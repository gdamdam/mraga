import { test, expect } from "@playwright/test";
import { encodeScene } from "../../src/shareCodec";

test("loads, imports an mdrone link, and toggles play", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "mraga" })).toBeVisible();

  // Build a real mdrone link for a D / maqam-rast scene using mraga's own codec
  // (the plain ?b= form), so the test exercises the exact decoder the app uses.
  const scene = { version: 1, name: "e2e", drone: { root: "D", octave: 4, tuningId: "maqam-rast" } };
  const { key, value } = await encodeScene(scene, { compress: false });
  const link = `https://app.mdrone.org/?${key}=${value}`;

  await page.getByLabel("mdrone link").fill(link);
  await page.getByLabel("mdrone link").blur();
  await expect(page.getByText(/linked: D/)).toBeVisible();

  await page.getByRole("button", { name: /PLAY/ }).click();
  await expect(page.getByRole("button", { name: /STOP/ })).toBeVisible();
  await page.getByRole("button", { name: /STOP/ }).click();
  await expect(page.getByRole("button", { name: /PLAY/ })).toBeVisible();
});
