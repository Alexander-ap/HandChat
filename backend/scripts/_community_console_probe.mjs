import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const target = process.argv[2] || "http://127.0.0.1:5173/community";
const mode = process.argv[3] || "normal";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const page = await browser.newPage();
const logs = [];
const failures = [];

page.on("console", async (msg) => {
  const location = msg.location();
  logs.push({
    type: msg.type(),
    text: msg.text(),
    location,
  });
});

page.on("pageerror", (error) => {
  logs.push({
    type: "pageerror",
    text: error.message,
    stack: error.stack,
  });
});

page.on("requestfailed", (request) => {
  failures.push({
    url: request.url(),
    method: request.method(),
    failure: request.failure(),
  });
});

if (mode === "api-503") {
  await page.route("**/edge/posts**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "服务暂时不可用，请稍后重试" }),
    });
  });
}

if (mode === "api-timeout") {
  await page.route("**/edge/posts**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 13000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ posts: [] }),
    });
  });
}

await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(mode === "api-timeout" ? 15000 : 2500);

const summary = {
  mode,
  url: page.url(),
  title: await page.title(),
  textSnippet: (await page.locator("body").innerText()).slice(0, 400),
  logs,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
writeFileSync(new URL("../probe-latest.json", import.meta.url), JSON.stringify(summary, null, 2), "utf-8");
await browser.close();
