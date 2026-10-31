#!/usr/bin/env node
/**
 * Automated Test Runner for WeatherCast India Frontend E2E & Component Integration Tests.
 * Uses esbuild to compile TypeScript & TSX with headless Leaflet/DOM mocks,
 * and executes via Node.js native test runner (node:test).
 */
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const frontendRoot = path.resolve(__dirname, "..");
const testsDir = path.resolve(frontendRoot, "tests");
const builtDir = path.resolve(testsDir, ".built");

// Ensure .built directory exists
if (!fs.existsSync(builtDir)) {
  fs.mkdirSync(builtDir, { recursive: true });
}

// Find all test files in frontend/tests
const testFiles = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
  .map((f) => path.resolve(testsDir, f));

if (testFiles.length === 0) {
  console.error("No test files found in", testsDir);
  process.exit(1);
}

console.log(`[E2E Runner] Found ${testFiles.length} test file(s) to compile and execute:`);
for (const f of testFiles) {
  console.log(`  - ${path.basename(f)}`);
}

// Esbuild plugin to mock leaflet and css
const testMockPlugin = {
  name: "test-mock-plugin",
  setup(build) {
    // Intercept CSS imports
    build.onResolve({ filter: /\.css$/ }, (args) => {
      return { path: args.path, namespace: "empty-css" };
    });
    build.onLoad({ filter: /.*/, namespace: "empty-css" }, () => {
      return { contents: "", loader: "js" };
    });

    // Intercept leaflet and react-leaflet
    build.onResolve({ filter: /^(leaflet|react-leaflet)$/ }, () => {
      return { path: path.resolve(testsDir, "mocks/leafletMock.tsx") };
    });

    // Intercept useFetch hook to provide deterministic data across all tiers
    build.onResolve({ filter: /useFetch(\.ts)?$/ }, () => {
      return { path: path.resolve(testsDir, "mocks/useFetchMock.ts") };
    });
  },
};

const outputFiles = [];

// Compile each test file
for (const file of testFiles) {
  const baseName = path.basename(file).replace(/\.tsx?$/, ".mjs");
  const outFile = path.resolve(builtDir, baseName);

  try {
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      outfile: outFile,
      format: "esm",
      platform: "node",
      target: "node20",
      packages: "external",
      jsx: "automatic",
      define: {
        "import.meta.env.VITE_API_BASE_URL": JSON.stringify("http://127.0.0.1:8000"),
        "import.meta.env.MODE": JSON.stringify("test"),
        "import.meta.env.DEV": "false",
        "import.meta.env.PROD": "true",
      },
      plugins: [testMockPlugin],
    });
    outputFiles.push(outFile);
  } catch (err) {
    console.error(`[E2E Runner] Compilation failed for ${path.basename(file)}:`, err);
    process.exit(1);
  }
}

console.log(`[E2E Runner] Successfully compiled ${outputFiles.length} test bundle(s). Executing tests...\n`);

// Run node --test on the output files
const child = spawn(process.execPath, ["--test", ...outputFiles], {
  stdio: "inherit",
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: "test",
  },
});

child.on("close", (code) => {
  if (code === 0) {
    console.log(`\n[E2E Runner] ALL TESTS PASSED SUCCESSFULLY! (exit code 0)`);
  } else {
    console.error(`\n[E2E Runner] TESTS FAILED with exit code ${code}`);
  }
  process.exit(code ?? 1);
});
