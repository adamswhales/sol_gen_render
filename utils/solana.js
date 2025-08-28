const { Connection, Keypair, PublicKey, clusterApiUrl, Transaction } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType } = require('@solana/spl-token');
const bs58 = require('bs58');
const {
  PROGRAM_ID: TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createUpdateMetadataAccountV2Instruction
} = require('@metaplex-foundation/mpl-token-metadata');

const DECIMALS = 9;
const getConnection = () => new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

async function getMetadataPDA(mint){
  const { PublicKey } = require('@solana/web3.js');
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

async function createFullToken({ base58SecretKey, supply, name, symbol, uri, revokeNow }) {
  if (!base58SecretKey) throw new Error('Missing base58SecretKey');
  if (!supply || !Number.isFinite(supply) || supply <= 0) throw new Error('Invalid supply');
  const connection = getConnection();
  const owner = Keypair.fromSecretKey(bs58.decode(base58SecretKey));

  // Create mint
  const mintPubkey = await createMint(connection, owner, owner.publicKey, owner.publicKey, DECIMALS);

  // Create metadata
  const metadataPDA = await getMetadataPDA(mintPubkey);
  const dataV2 = {
    name: (name||'').slice(0,32),
    symbol: (symbol||'').slice(0,10),
    uri: uri || '',
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
  };
  const createIx = createCreateMetadataAccountV3Instruction(
    { metadata: metadataPDA, mint: mintPubkey, mintAuthority: owner.publicKey, payer: owner.publicKey, updateAuthority: owner.publicKey },
    { createMetadataAccountArgsV3: { data: dataV2, isMutable: !revokeNow, collectionDetails: null } }
  );
  await connection.sendTransaction(new Transaction().add(createIx), [owner]);

  // Mint supply
  const ata = await getOrCreateAssociatedTokenAccount(connection, owner, mintPubkey, owner.publicKey);
  const amount = BigInt(Math.floor(supply)) * BigInt(1_000_000_000);
  await mintTo(connection, owner, mintPubkey, ata.address, owner, amount);

  // Optional revoke authorities & immutability
  if (revokeNow){
    await setAuthority(connection, owner, mintPubkey, owner.publicKey, AuthorityType.MintTokens, null);
    await setAuthority(connection, owner, mintPubkey, owner.publicKey, AuthorityType.FreezeAccount, null);
    try{
      const updateIx = createUpdateMetadataAccountV2Instruction(
        { metadata: metadataPDA, updateAuthority: owner.publicKey },
        { updateMetadataAccountArgsV2: { data: null, updateAuthority: null, primarySaleHappened: null, isMutable: false } }
      );
      await connection.sendTransaction(new Transaction().add(updateIx), [owner]);
    }catch(e){ /* already immutable or metadata not found */ }
  }

  return {
    mint: mintPubkey.toBase58(),
    owner: owner.publicKey.toBase58(),
    explorerMint: `https://explorer.solana.com/address/${mintPubkey.toBase58()}?cluster=mainnet`,
    explorerOwner: `https://explorer.solana.com/address/${owner.publicKey.toBase58()}?cluster=mainnet`
  };
}

async function revokeAll({ base58SecretKey, mintAddress }) {
  const connection = getConnection();
  const owner = Keypair.fromSecretKey(bs58.decode(base58SecretKey));
  const mint = new PublicKey(mintAddress);
  const metadataPDA = await getMetadataPDA(mint);

  await setAuthority(connection, owner, mint, owner.publicKey, AuthorityType.MintTokens, null);
  await setAuthority(connection, owner, mint, owner.publicKey, AuthorityType.FreezeAccount, null);

  try{
    const updateIx = createUpdateMetadataAccountV2Instruction(
      { metadata: metadataPDA, updateAuthority: owner.publicKey },
      { updateMetadataAccountArgsV2: { data: null, updateAuthority: null, primarySaleHappened: null, isMutable: false } }
    );
    await connection.sendTransaction(new Transaction().add(updateIx), [owner]);
  }catch(e){}

  return { ok: true, explorer: `https://explorer.solana.com/address/${mint.toBase58()}?cluster=mainnet` };
}

module.exports = { createFullToken, revokeAll, DECIMALS };
