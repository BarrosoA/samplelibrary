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
  if (data.error_code === 401) throw new Error('Telegram rejected the token. Copy it again from BotFather, or send /token there to see it.');
  if (!data.ok) throw new Error(data.description || `Telegram answered HTTP ${res.status}`);
  return data.result;
};

function ask(question, { wipe = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      // takes the pasted token back off the screen once it has been read
      if (wipe && process.stdout.isTTY) {
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
        process.stdout.write(`${question}(received)\n`);
      }
      resolve(answer);
    })
  );
}

async function main() {
  console.log('Download notifications on Telegram\n');
  console.log('1. In Telegram, open @BotFather, send /newbot and follow the steps.');
  console.log('2. BotFather replies with a token like 123456789:ABC-...\n');

  // right-click or Ctrl+V pastes in the VS Code terminal; extra text around the token is ignored
  const pasted = await ask('Paste the bot token and press Enter: ', { wipe: true });
  const token = (pasted.match(/\d{5,}:[\w-]{30,}/) || [])[0];
  if (!token) throw new Error("Couldn't find a bot token in what was pasted. It looks like 123456789:AAH... (copy it from BotFather's message).");
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
