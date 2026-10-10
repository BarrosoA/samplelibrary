// one-time setup for download notifications: links a telegram bot to the download counter on cloudflare
const readline = require('readline');
const media = require('./lib/media-store.cjs');

const api = async (token, method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram answered HTTP ${res.status}`);
  return data.result;
};

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // keeps the token off the screen while it's pasted
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : '');
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    })
  );
}

async function main() {
  console.log('Download notifications on Telegram\n');
  console.log('1. In Telegram, open @BotFather, send /newbot and follow the steps.');
  console.log('2. BotFather replies with a token like 123456789:ABC-...\n');

  const token = await ask('Paste the bot token (hidden): ', { hidden: true });
  if (!/^\d+:[\w-]{30,}$/.test(token)) throw new Error("That doesn't look like a bot token.");
  const bot = await api(token, 'getMe');

  console.log(`\n3. Open https://t.me/${bot.username} in Telegram, press Start (or send it any message).`);
  await ask('   Press Enter once you have done that... ');

  const updates = await api(token, 'getUpdates');
  const chat = updates
    .map((u) => u.message?.chat)
    .filter((c) => c && c.type === 'private')
    .pop();
  if (!chat) throw new Error(`No message found. Send any message to @${bot.username}, then run this again.`);

  await api(token, 'sendMessage', {
    chat_id: chat.id,
    text: '✅ Download notifications are set up. They start after your next PUBLISH TO LIVE.',
  });

  console.log('\nSaving the token and chat on Cloudflare (as encrypted secrets)...');
  media.ensureProject();
  media.setPagesSecret('TELEGRAM_BOT_TOKEN', token);
  media.setPagesSecret('TELEGRAM_CHAT_ID', String(chat.id));
  media.markTelegramSetUp(chat.id);

  console.log(`\nDone. @${bot.username} sent you a test message.`);
  console.log('Notifications start after your next PUBLISH TO LIVE in Studio Manager.');
}

main().catch((err) => {
  console.error(`\nSetup failed: ${(err.stderr || err.message).toString().trim().split('\n').pop()}`);
  process.exit(1);
});
