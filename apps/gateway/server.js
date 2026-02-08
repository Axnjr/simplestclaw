import { spawn } from 'child_process';
import http from 'http';

const PORT = process.env.PORT || 3000;
const OPENCLAW_PORT = 18789;

// Health check state
let openclawHealthy = false;
let openclawProcess = null;

// Start OpenClaw gateway as child process
function startOpenClaw() {
  console.log('Starting OpenClaw gateway...');
  
  const args = [
    'openclaw', 'gateway',
    '--port', String(OPENCLAW_PORT),
    '--bind', 'lan',
    '--allow-unconfigured'
  ];

  // Add token if configured
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    args.push('--token', process.env.OPENCLAW_GATEWAY_TOKEN);
  }

  openclawProcess = spawn('npx', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Pass through API keys for supported providers
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    }
  });

  openclawProcess.stdout.on('data', (data) => {
    console.log(`[openclaw] ${data.toString().trim()}`);
    // Mark healthy when gateway starts
    if (data.toString().includes('listening') || data.toString().includes('started')) {
      openclawHealthy = true;
    }
  });

  openclawProcess.stderr.on('data', (data) => {
    console.error(`[openclaw] ${data.toString().trim()}`);
  });

  openclawProcess.on('close', (code) => {
    console.log(`OpenClaw exited with code ${code}`);
    openclawHealthy = false;
    // Restart after delay
    setTimeout(startOpenClaw, 5000);
  });

  // Mark healthy after startup delay
  setTimeout(() => {
    openclawHealthy = true;
  }, 3000);
}

// Simple HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    if (openclawHealthy) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        openclaw: 'running',
        wsPort: OPENCLAW_PORT 
      }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting' }));
    }
  } else {
    // Redirect to OpenClaw dashboard
    res.writeHead(302, { 'Location': `http://localhost:${OPENCLAW_PORT}${req.url}` });
    res.end();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  if (openclawProcess) {
    openclawProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  if (openclawProcess) {
    openclawProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
});

// Start
startOpenClaw();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server listening on port ${PORT}`);
  console.log(`OpenClaw gateway will run on port ${OPENCLAW_PORT}`);
});
