const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const root = __dirname;
const options = {
  key: fs.readFileSync(path.join(root, 'key.pem')),
  cert: fs.readFileSync(path.join(root, 'cert.pem')),
};

https.createServer(options, (request, response) => {
  if (request.url === '/test.webm') {
    const body = fs.readFileSync(path.join(root, 'test.webm'));
    response.writeHead(200, { 'content-type': 'video/webm' });
    response.end(body);
    return;
  }
  if (request.url === '/captions.vtt') {
    const body = fs.readFileSync(path.join(root, 'captions.vtt'));
    response.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
    response.end(body);
    return;
  }
  const requestPath = new URL(request.url, 'https://www.udemy.com').pathname;
  if (requestPath !== '/course/test/learn/lecture/4242') {
    response.writeHead(302, { Location: '/course/test/learn/lecture/4242' });
    response.end();
    return;
  }
  const body = fs.readFileSync(path.join(root, 'index.html'));
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
}).listen(8777, '127.0.0.1', () => {
  console.log('G7_FIXTURE_READY https://www.udemy.com:8777/course/test/learn/lecture/4242');
});
