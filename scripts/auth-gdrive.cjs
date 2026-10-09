const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { google } = require('googleapis');

const OAUTH_CLIENT_PATH = path.join(
  process.env.USERPROFILE || 'C:\\Users\\noluv',
  '.credentials',
  'samplelibrary-oauth-client.json'
);

const OAUTH_TOKEN_PATH = path.join(
  process.env.USERPROFILE || 'C:\\Users\\noluv',
  '.credentials',
  'samplelibrary-oauth-token.json'
);

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

if (!fs.existsSync(OAUTH_CLIENT_PATH)) {
  console.error(`Client credentials file not found at: ${OAUTH_CLIENT_PATH}`);
  process.exit(1);
}

const clientRaw = JSON.parse(fs.readFileSync(OAUTH_CLIENT_PATH, 'utf8'));
const installed = clientRaw.installed || clientRaw.web;
if (!installed) {
  console.error('Invalid client credentials: expected "installed" or "web" key.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  installed.client_id,
  installed.client_secret,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code;
    const error = parsedUrl.query.error;

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h2>Authorization Error: ${error}</h2><p>Check the console for details.</p>`);
      console.error(`Authorization error: ${error}`);
      server.close();
      process.exit(1);
      return;
    }

    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        fs.writeFileSync(OAUTH_TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #09090b; color: #f4f4f5;">
            <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px 48px; text-align: center; max-width: 480px;">
              <h1 style="color: #10b981; font-size: 24px; margin-bottom: 12px;">Authentication Successful</h1>
              <p style="color: #a1a1aa; font-size: 14px; line-height: 1.5;">Your Google Drive token has been securely saved to ~/.credentials/samplelibrary-oauth-token.json.</p>
              <p style="color: #71717a; font-size: 13px; margin-top: 16px;">You can now close this tab and return to the application.</p>
            </div>
          </div>
        `);
        console.log(`\nTokens successfully saved to: ${OAUTH_TOKEN_PATH}`);
        server.close();
        process.exit(0);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>Token Exchange Failed</h2><p>${err.message}</p>`);
        console.error('Failed to exchange code for tokens:', err);
        server.close();
        process.exit(1);
      }
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`OAuth loopback server listening on ${REDIRECT_URI}`);
  console.log(`Opening browser for Google authorization...\n`);
  console.log(`If browser does not open automatically, visit this link:\n\n${authUrl}\n`);
  exec(`start "" "${authUrl}"`);
});

