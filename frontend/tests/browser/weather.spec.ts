import { expect, test, type Page } from "@playwright/test";

async function openModule(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("navigation", { name: "Main Navigation" }).getByRole("button", { name, exact: true }).click();
}

test("serves forecasts and saved history across all six modules", async ({ page }, info) => {
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("System Live", { exact: true })).toBeVisible();

  const state = page.locator("#forecast-state-select");
  await state.selectOption("Karnataka");
  const date = page.locator("#forecast-target-date");
  await expect(date).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  const targetDate = await date.inputValue();
  const futureResponse = page.waitForResponse((response) => response.url().endsWith("/api/predict"));
  await page.getByRole("button", { name: "Generate 7-Day Forecast" }).click();
  const forecast = await futureResponse;
  expect(forecast.status(), await forecast.text()).toBe(200);
  const result = await forecast.json();
  expect(result.forecast_date).toBe(targetDate);
  expect(result.predicted_temp_avg).toHaveLength(7);
  expect(result.predicted_temp_avg.every(Number.isFinite)).toBe(true);
  await expect(page.locator(".horizon-day-card")).toHaveCount(7);
  await page.locator(".horizon-day-card").nth(6).press("Enter");
  await expect(page.getByText(/Day 7 ML predictions & rule-based estimates/)).toBeVisible();
  expect(result.rainfall_ml_status).toBe("amount_withheld");
  for (const day of result.daily_forecasts) {
    const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: new RegExp(`^Day ${day.day}\\b`) }) });
    expect(day.ml_rainfall_mm).toBeNull();
    await expect(row.getByRole("cell", { name: "Withheld", exact: true })).toHaveCount(day.ml_rain_probability == null ? 2 : 1);
    if (day.ml_rain_probability != null) await expect(row).toContainText(`${(day.ml_rain_probability * 100).toFixed(0)}%`);
  }

  await page.getByLabel("Include experimental rainfall amounts").check();
  const previewResponse = page.waitForResponse(response => response.url().endsWith("/api/predict"));
  await page.getByRole("button", { name: "Generate 7-Day Forecast" }).click();
  const preview = await (await previewResponse).json();
  expect(preview.rainfall_ml_status).toBe("research_preview");
  await expect(page.getByRole("status").filter({ hasText: "Research preview" })).toBeVisible();
  const badges = page.locator(".forecast-rain-badge");
  await expect(badges.first()).toContainText(`${preview.daily_forecasts[0].ml_rainfall_mm.toFixed(2)} mm`);
  await expect(badges.last()).toContainText(`${(result.daily_forecasts[0].ml_rain_probability * 100).toFixed(0)}%`);
  for (const badge of await badges.all()) {
    await expect(badge).toHaveCSS("color", "rgb(15, 23, 42)");
    await expect(badge).toHaveCSS("background-color", "rgb(241, 245, 249)");
  }

  await openModule(page, "Prediction History");
  await expect(page.getByRole("heading", { name: /Prediction History/ })).toBeVisible();
  const stored = page.getByRole("row").filter({ hasText: "Karnataka" }).first();
  await expect(stored).toContainText("weather_model_v3");
  await stored.getByRole("button").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await openModule(page, "Weather History");
  await expect(page.getByRole("heading", { name: "Weather History Archive" })).toBeVisible();
  const archiveState = page.getByRole("combobox", { name: "State", exact: true });
  await archiveState.selectOption("Karnataka");
  await expect(page.getByRole("row").nth(1)).toBeVisible();

  await openModule(page, "ML Project Overview");
  await expect(page.getByRole("heading", { name: "Machine Learning System Architecture" })).toBeVisible();
  await expect(page.getByText("2026-10-22", { exact: true })).toBeVisible();

  await openModule(page, "Model Performance");
  await expect(page.getByText("Diagnostic — Pending Independent Validation", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "RMSE (Lower is Better)" }).click();
  await expect(page.getByRole("button", { name: "RMSE (Lower is Better)" })).toHaveAttribute("aria-pressed", "true");

  const mapResponse = page.waitForResponse((response) => response.url().includes("/api/forecast/all?day=1"));
  await openModule(page, "India Weather Map");
  await expect(page.getByRole("heading", { name: "India Meteorological Intelligence Map" })).toBeVisible();
  const map = await mapResponse;
  expect(map.status()).toBe(200);
  expect(Number.isFinite((await map.json()).Karnataka)).toBe(true);
  await expect(page.locator(".leaflet-container")).toBeVisible();
  if (info.project.name === "mobile") {
    const menu = page.getByRole("button", { name: "Open navigation menu" });
    await menu.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.use.viewport!.width);
  }
  expect(clientErrors).toEqual([]);
});

test("keeps temperature visible when rainfall is unavailable", async ({ page }) => {
  await page.goto("/");
  await page.locator("#forecast-state-select").selectOption("Karnataka");
  await expect(page.locator("#forecast-target-date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  for (const [status, message] of [
    ["model_unavailable", "The ML rainfall model is unavailable."],
    ["inference_error", "The ML rainfall model could not calculate this forecast."],
    ["invalid_history", "Rainfall inference requires seven consecutive days of valid statewide measurements."],
  ]) {
    await page.route("**/api/predict", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.rainfall_ml_status = status;
      for (const day of data.daily_forecasts) {
        day.ml_rainfall_mm = null;
        day.ml_rain_probability = null;
      }
      await route.fulfill({ response, json: data });
    }, { times: 1 });
    await page.getByRole("button", { name: "Generate 7-Day Forecast" }).click();
    await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
    await expect(page.locator(".forecast-hero-temp")).toHaveText(/\d.*°C/);
    await expect(page.locator(".horizon-day-card")).toHaveCount(7);
    await expect(page.getByRole("cell", { name: "Unavailable", exact: true })).toHaveCount(14);
  }
});
