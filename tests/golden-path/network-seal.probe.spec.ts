// NEGATIVE CONTROL for the node lane's network seal (tests/_seal.ts, installed by
// playwright.config.ts). Its pass condition is a refusal: if the seal stopped being installed in the
// workers, the first test goes red here instead of every other probe silently reaching the internet.
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";

import { test, expect } from "@playwright/test";

test("fetch to a real host is refused, naming the host", async () => {
  await expect(fetch("https://example.com/")).rejects.toThrow(/network sealed: .*https:\/\/example\.com/);
});

test("http.get and https.request to a real host are refused", () => {
  expect(() => http.get("http://example.com/")).toThrow(/network sealed/);
  expect(() => https.request({ hostname: "example.com", path: "/" })).toThrow(/network sealed/);
});

test("loopback still works: a local server answers through fetch and http.get", async () => {
  const server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("ok");
    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://localhost:${port}/`, (res) => {
        let b = "";
        res.on("data", (c: Buffer) => (b += c.toString()));
        res.on("end", () => resolve(b));
      }).on("error", reject);
    });
    expect(body).toBe("ok");
  } finally {
    server.close();
  }
});

test("data: URLs pass the seal", async () => {
  expect(await (await fetch("data:text/plain,hi")).text()).toBe("hi");
});
