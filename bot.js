  require('dotenv').config();
  const { Telegraf } = require('telegraf');
  const { uploadImageAndMetadata } = require('./utils/nftStorage');
  const { createFullToken, revokeAll, DECIMALS } = require('./utils/solana');
  const { generateIdea } = require('./utils/ideaGenerator');

  if (!process.env.BOT_TOKEN) { console.error('Missing BOT_TOKEN in .env'); process.exit(1); }

  const bot = new Telegraf(process.env.BOT_TOKEN);
  const sessions = new Map();
  const ask = (ctx, text) => ctx.reply(text, { parse_mode: 'Markdown' });

  bot.start((ctx)=> ask(ctx,
    '🤖 *sol-gen-idea-pro*\n\n' +
    'Commands:\n' +
    '/idea — Generate token idea (Dexscreener + optional OpenAI)\n' +
    '/create — Create token (9 decimals) with image + social links\n' +
    '/revoke <MINT> — Revoke mint/freeze & lock metadata\n' +
    '/cancel — Reset session'
  ));

  bot.command('cancel', (ctx)=>{ sessions.delete(ctx.chat.id); ask(ctx,'🧹 Session cleared.'); });

  // /idea
  bot.command('idea', async (ctx) => {
    const idea = await generateIdea();
    await ask(ctx, `💡 *Idea*\n🪙 *Name:* ${idea.name}\n🔤 *Symbol:* ${idea.symbol}\n📝 ${idea.description}\n\nRun /create to mint it.`);
  });

  // /create flow
  bot.command('create', (ctx)=>{
    sessions.set(ctx.chat.id, { step: 'name' });
    ask(ctx, '🪙 Send *Token Name*:');
  });

  bot.on('text', async (ctx, next) => {
    const s = sessions.get(ctx.chat.id);
    const t = ctx.message.text?.trim();
    if (!s) return next();
    if (t.startsWith('/')) return next();

    if (s.step === 'name'){ s.name=t.slice(0,32); s.step='symbol'; return ask(ctx,'🔤 Send *Symbol* (4–10 chars):'); }
    if (s.step === 'symbol'){ s.symbol=t.slice(0,10).toUpperCase(); s.step='desc'; return ask(ctx,'📝 Send *Description*:'); }
    if (s.step === 'desc'){ s.description=t; s.step='supply'; return ask(ctx,'💰 Send *Total Supply* (integer):'); }
    if (s.step === 'supply'){
      const n = Number(t.replace(/[,_\s]/g,''));
      if (!Number.isFinite(n) || n<=0) return ask(ctx,'❌ Invalid supply. Try again.');
      s.supply = Math.floor(n);
      s.step='image';
      return ask(ctx,'📸 Upload your *token image* as a Telegram photo.');
    }
    if (s.step === 'website'){ s.website=t; s.step='twitter'; return ask(ctx,'🐦 *Twitter/X* URL (or `skip`):'); }
    if (s.step === 'twitter'){ if (t.toLowerCase()!=='skip') s.twitter=t; s.step='telegram'; return ask(ctx,'📣 *Telegram* URL (or `skip`):'); }
    if (s.step === 'telegram'){ if (t.toLowerCase()!=='skip') s.tg=t; s.step='discord'; return ask(ctx,'👥 *Discord* URL (or `skip`):'); }
    if (s.step === 'discord'){ if (t.toLowerCase()!=='skip') s.discord=t; s.step='confirm'; return showConfirm(ctx, s); }
    if (s.step === 'await_key'){ return await doMint(ctx, s, t); }
  });

  bot.on('photo', async (ctx)=>{
    const s = sessions.get(ctx.chat.id);
    if (!s || s.step !== 'image') return;
    if (!process.env.NFT_STORAGE_API_KEY) return ask(ctx, '⚠️ Set NFT_STORAGE_API_KEY in .env and restart.');
    try{
      const photo = ctx.message.photo.at(-1);
      const link = await ctx.telegram.getFileLink(photo.file_id);
      s.imageUrl = link.href;
      s.step = 'website';
      await ask(ctx, '🌐 *Website* URL (or type `skip`):');
    }catch(e){
      console.error(e);
      ask(ctx, '❌ Failed to read image. Try again.');
    }
  });

  bot.command('revoke_yes', (ctx)=>{ const s=sessions.get(ctx.chat.id)||{}; s.revoke=true; sessions.set(ctx.chat.id,s); ask(ctx,'🔒 Will revoke *mint*/*freeze* and lock metadata.'); });
  bot.command('revoke_no', (ctx)=>{ const s=sessions.get(ctx.chat.id)||{}; s.revoke=false; sessions.set(ctx.chat.id,s); ask(ctx,'🔓 Authorities will be kept.'); });

  async function showConfirm(ctx, s){
    const ext = { website: s.website||'', twitter: s.twitter||'', telegram: s.tg||'', discord: s.discord||'' };
    await ask(ctx,
`📦 *Review*
🪙 *Name:* ${s.name}
🔤 *Symbol:* ${s.symbol}
📝 *Desc:* ${s.description}
💰 *Supply:* ${s.supply.toLocaleString()}
🧮 *Decimals:* ${DECIMALS}
🔗 *Links:* ${Object.entries(ext).filter(([k,v])=>v).map(([k,v])=>`${k}: ${v}`).join(' | ') || 'none'}

Set /revoke_yes or /revoke_no, then send your *base58 secret key* to mint.`);
    s.step='await_key';
    s.extensions = ext;
    sessions.set(ctx.chat.id, s);
  }

  async function doMint(ctx, s, base58Key){
    try{
      await ask(ctx,'⛓️ Minting on Solana mainnet...');
      const uri = await uploadImageAndMetadata({ fileUrl: s.imageUrl, name: s.name, symbol: s.symbol, description: s.description, extensions: s.extensions });
      const out = await createFullToken({ base58SecretKey: base58Key, supply: s.supply, name: s.name, symbol: s.symbol, uri, revokeNow: !!s.revoke });
      sessions.delete(ctx.chat.id);
      await ctx.replyWithMarkdown(
`✅ *Token created!*
🧾 *Mint:* [${out.mint}](${out.explorerMint})
👛 *Owner:* [${out.owner}](${out.explorerOwner})
🔗 *Metadata:* ${uri}
${s.revoke ? '🔒 Authorities revoked & metadata locked.' : '🔓 Authorities kept (you can /revoke later).'}`
      );
    }catch(e){
      console.error(e);
      await ask(ctx, '❌ Mint failed: ' + e.message);
    }
  }

  // Post-launch revoke
  bot.command('revoke', async (ctx)=>{
    const parts = String(ctx.message.text).trim().split(/\s+/);
    if (parts.length < 2) return ask(ctx, 'Usage: /revoke <MINT_ADDRESS>');
    sessions.set(ctx.chat.id, { step: 'await_revoke_key', mint: parts[1] });
    ask(ctx, '🔑 Send your *base58 secret key* (token owner) to revoke authorities & lock metadata.');
  });

  bot.on('text', async (ctx, next) => {
    const s = sessions.get(ctx.chat.id);
    const t = ctx.message.text?.trim();
    if (!s || s.step !== 'await_revoke_key') return next();
    try{
      const out = await revokeAll({ base58SecretKey: t, mintAddress: s.mint });
      sessions.delete(ctx.chat.id);
      await ctx.reply(`✅ Revoked. Explorer: ${out.explorer}`);
    }catch(e){
      await ctx.reply('❌ Revoke failed: ' + e.message);
    }
  });

  bot.launch();
