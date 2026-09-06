const http = require("node:http");
const { spawn } = require("node:child_process");

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/done") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      console.log("=== CHROME RENDERED AUDIO RESULTS ===");
      console.log(body);
      console.log("=====================================");
      res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
      res.end("ok");
      setTimeout(() => process.exit(0), 500);
    });
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(8999, () => {
  console.log("Server listening on 8999");
  spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    "file:///c:/Projetos2026/S.IA/S.IA_Audio-learning/scratch/test_offline_audio.html"
  ]);
});

setTimeout(() => {
  console.log("Timeout waiting for Chrome");
  process.exit(1);
}, 10000);
