import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const log = process.argv[2];
if (!log) throw new Error('usage: node sink.mjs /absolute/path/to/requests.jsonl');
const server = createServer((request, response) => {
  appendFileSync(
    log,
    `${JSON.stringify({ time: new Date().toISOString(), method: request.method, path: request.url, headers: request.headers })}\n`
  );
  request.resume();
  if (request.url === '/redirect') {
    response.writeHead(302, { Location: 'mdhere-story://localhost/1/Story.html' });
  } else {
    response.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Access-Control-Allow-Origin': '*'
    });
  }
  response.end('document.body.dataset.unauthorizedScript = "ran";');
});
const port = Number(process.env.MDHERE_GATE_SINK_PORT ?? '8765');
server.listen(port, '127.0.0.1', () =>
  console.log(`sink ready at http://127.0.0.1:${server.address().port}; log ${log}`)
);
