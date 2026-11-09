import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { getForecastAll, ApiError } from "../src/services/api";
import { IndiaMap } from "../src/components/IndiaMap";
import { IndiaMapPage } from "../src/pages/IndiaMapPage";
import { renderComponent, assertContains } from "./mocks/testUtils";

describe("Forecast API Regression & Integration Tests", () => {
  const originalFetch = globalThis.fetch;
  let recordedUrls: string[] = [];

  beforeEach(() => {
    recordedUrls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Day-based requests send the correct day parameter
  it("sends correct day parameter for day-based requests", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      recordedUrls.push(urlStr);
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 24.5, Maharashtra: 26.2 }),
      } as Response;
    }) as any;

    const dataDay1 = await getForecastAll(1);
    assert.deepEqual(dataDay1, { Karnataka: 24.5, Maharashtra: 26.2 });
    assert.match(recordedUrls[0], /\/forecast\/all\?day=1$/);

    const dataDay7 = await getForecastAll(7);
    assert.deepEqual(dataDay7, { Karnataka: 24.5, Maharashtra: 26.2 });
    assert.match(recordedUrls[1], /\/forecast\/all\?day=7$/);
  });

  // 2. Date-based requests send the correct date parameter
  it("sends correct date parameter for date-based requests", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 25.0 }),
      } as Response;
    }) as any;

    const data = await getForecastAll("2026-11-10");
    assert.deepEqual(data, { Karnataka: 25.0 });
    assert.match(recordedUrls[0], /\/forecast\/all\?date=2026-11-10$/);
  });

  // 3. Combined day and date parameters
  it("sends both day and date when both are provided", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 23.0 }),
      } as Response;
    }) as any;

    const data = await getForecastAll(3, "2026-11-10");
    assert.deepEqual(data, { Karnataka: 23.0 });
    assert.match(recordedUrls[0], /\/forecast\/all\?day=3&date=2026-11-10$/);
  });

  // 4. Existing callers compatibility (no args or string digit)
  it("preserves compatibility with empty arguments and string digit days", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Delhi: 20.0 }),
      } as Response;
    }) as any;

    // No argument
    await getForecastAll();
    assert.match(recordedUrls[0], /\/forecast\/all$/);

    // String digit day
    await getForecastAll("4");
    assert.match(recordedUrls[1], /\/forecast\/all\?day=4$/);
  });

  // 5. HTTP 422 and other API errors are handled correctly
  it("correctly handles HTTP 422 Unprocessable Entity responses", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({ detail: "Invalid day parameter: must be between 1 and 7." }),
      } as Response;
    }) as any;

    try {
      await getForecastAll(99);
      assert.fail("Should have thrown ApiError");
    } catch (err) {
      assert(err instanceof ApiError);
      assert.equal(err.status, 422);
      assert.equal(err.message, "Invalid day parameter: must be between 1 and 7.");
    }
  });

  it("correctly handles HTTP 500 and network failure errors", async () => {
    // HTTP 500
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ detail: "Database connection failed" }),
      } as Response;
    }) as any;

    try {
      await getForecastAll(1);
      assert.fail("Should have thrown ApiError on 500");
    } catch (err) {
      assert(err instanceof ApiError);
      assert.equal(err.status, 500);
      assert.equal(err.message, "Database connection failed");
    }

    // Network failure
    globalThis.fetch = (async () => {
      throw new Error("Connection refused");
    }) as any;

    try {
      await getForecastAll(1);
      assert.fail("Should have thrown ApiError on network failure");
    } catch (err) {
      assert(err instanceof ApiError);
      assert.equal(err.status, 0);
      assert.match(err.message, /Cannot reach the backend server/);
    }
  });

  // 6. UI components integrate with getForecastAll cleanly
  it("renders IndiaMap and IndiaMapPage using getForecastAll without crashing", () => {
    const mapHtml = renderComponent(
      <IndiaMap selectedState="Karnataka" forecastDay={2} />
    );
    assertContains(mapHtml, "map-shell-container");
    assertContains(mapHtml, "Day 2");

    const pageHtml = renderComponent(
      <IndiaMapPage selectedState="Karnataka" />
    );
    assertContains(pageHtml, "India Meteorological Intelligence Map");
    assertContains(pageHtml, "Karnataka");
  });
});
