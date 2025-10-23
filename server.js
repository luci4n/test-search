#!/usr/bin/env node
/**
 * Simple fake search API server.
 * Run with:  node fake-api.js
 * Then query: http://localhost:3000/api/search?q=apple
 */

import http from "http";
import url from "url";

const PORT = process.env.PORT || 8000;

// Sample dataset
const fruits = [
  "apple",
  "apricot",
  "banana",
  "blueberry",
  "cherry",
  "grape",
  "grapefruit",
  "kiwi",
  "lemon",
  "lime",
  "mango",
  "orange",
  "papaya",
  "peach",
  "pear",
  "pineapple",
  "plum",
  "pomegranate",
  "raspberry",
  "strawberry",
];

// Helper to simulate random delay and errors
function simulateSearch(term) {
  return new Promise((resolve, reject) => {
    const latency = 300 + Math.random() * 700; // 0.3–1.0s
    const shouldFail = Math.random() < 0.15; // 15% random failure

    setTimeout(() => {
      if (shouldFail) {
        reject(new Error("Random backend failure"));
      } else {
        const q = (term || "").toLowerCase();
        const results = fruits.filter((f) => f.includes(q));
        resolve(results);
      }
    }, latency);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // Basic CORS headers for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (parsed.pathname === "/api/search" && req.method === "GET") {
    const term = parsed.query.q || "";
    try {
      const results = await simulateSearch(term);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ query: term, results }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(PORT, () => {
  console.log(
    `🚀 Fake API running on http://localhost:${PORT}/api/search?q=apple`
  );
});
