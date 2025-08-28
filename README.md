# sol-gen-idea-pro

Telegram bot to mint Solana SPL tokens (9 decimals, user-set supply) with image + social links stored on NFT.Storage. 
Includes optional *immediate* or *post-launch* revoke of mint/freeze authorities and metadata immutability. 
`/idea` uses Dexscreener seeds and (optionally) OpenAI to enhance names/symbols/descriptions.

## Setup
```bash
npm install
cp .env.example .env
# Fill BOT_TOKEN and NFT_STORAGE_API_KEY
# (Optional) Set OPENAI_API_KEY to improve /idea output
npm start
```

## Commands
- `/idea` — token idea from Dexscreener (+ OpenAI if configured)
- `/create` — name → symbol → description → supply → upload image → social links → confirm → base58 secret → mint
- `/revoke <MINT>` — revoke mint/freeze & lock metadata later

## Notes
- Keep ~0.01–0.03 SOL in payer wallet for fees depending on network conditions.
- If you choose revoke during creation, metadata is set immutable and mint/freeze authorities are set to `null`.
