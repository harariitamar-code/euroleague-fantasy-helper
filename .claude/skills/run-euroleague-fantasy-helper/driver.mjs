#!/usr/bin/env node
// Drives the running `npm run dev` server with headless Chromium and
// writes screenshots to ./screenshots/. Requires the dev server already
// running on http://localhost:3000 (see SKILL.md "Run (agent path)").
//
// Usage:
//   node driver.mjs home                 # screenshot the landing page
//   node driver.mjs players              # screenshot the /players table
//   node driver.mjs search <query>       # type into the search box, screenshot
//
// Chromium binary path and BASE_URL can be overridden via env vars
// CHROMIUM_PATH / BASE_URL if the container layout ever changes.

import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(HERE, "screenshots");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const [, , cmd, ...rest] = process.argv;

async function withBrowser(fn) {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  try {
    await fn(page);
  } finally {
    if (errors.length) {
      console.error("Console/page errors:", JSON.stringify(errors, null, 2));
    }
    await browser.close();
  }
}

async function shot(page, name) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("Saved", file);
}

if (cmd === "home") {
  await withBrowser(async (page) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await shot(page, "home");
  });
} else if (cmd === "players") {
  await withBrowser(async (page) => {
    await page.goto(`${BASE_URL}/players`, { waitUntil: "networkidle" });
    await shot(page, "players");
  });
} else if (cmd === "search") {
  const query = rest.join(" ");
  if (!query) {
    console.error("Usage: node driver.mjs search <query>");
    process.exit(1);
  }
  await withBrowser(async (page) => {
    await page.goto(`${BASE_URL}/players`, { waitUntil: "networkidle" });
    await page.fill('input[placeholder*="Search"]', query);
    await page.waitForTimeout(300);
    await shot(page, `search-${query.replace(/[^a-z0-9]+/gi, "_")}`);
  });
} else if (cmd === "click-view-players") {
  // Full nav flow: home -> click "View players" link -> confirm URL.
  await withBrowser(async (page) => {
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL("**/players"),
      page.click("a:has-text('View players')"),
    ]);
    await page.waitForLoadState("networkidle");
    console.log("URL after click:", page.url());
    await shot(page, "click-view-players");
  });
} else {
  console.error(
    "Usage: node driver.mjs <home|players|search <query>|click-view-players>"
  );
  process.exit(1);
}
