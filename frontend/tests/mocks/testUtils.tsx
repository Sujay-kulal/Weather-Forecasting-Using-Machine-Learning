import React from "react";
import { renderToString, renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";

/**
 * Render a React component to static HTML string in Node.js.
 */
export function renderComponent(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

/**
 * Assert that an HTML string contains a specific substring.
 */
export function assertContains(html: string, expected: string, message?: string) {
  assert.ok(
    html.includes(expected),
    message || `Expected HTML to contain: "${expected}"\nActual snippet: ${html.slice(0, 300)}...`
  );
}

/**
 * Assert that an HTML string does NOT contain a specific substring.
 */
export function assertNotContains(html: string, forbidden: string, message?: string) {
  assert.ok(
    !html.includes(forbidden),
    message || `Expected HTML to NOT contain: "${forbidden}"`
  );
}

/**
 * Assert that an HTML string matches a regex pattern.
 */
export function assertMatches(html: string, pattern: RegExp, message?: string) {
  assert.ok(
    pattern.test(html),
    message || `Expected HTML to match pattern: ${pattern}\nActual snippet: ${html.slice(0, 300)}...`
  );
}
