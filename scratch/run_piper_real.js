const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/done") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      console.log("=== PIPER REAL RESULT ===");
      console.log(body);
      console.log("=========================");
      res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
      res.end("ok");
      setTimeout(() => process.exit(0), 1000);
    });
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT, req.url.split("?")[0]);
  if (req.url === "/" || req.url === "/test") {
    filePath = path.join(__dirname, "test_piper_real.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found: " + req.url);
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".wasm": "application/wasm",
    ".data": "application/octet-stream"
  };

  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*"
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(8998, () => {
  console.log("Server listening on 8998");
  spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "http://localhost:8998/"
  ]);
});

setTimeout(() => {
  console.log("Timeout waiting for Chrome (60s)");
  process.exit(1);
}, 60000);
