const axios = require('axios');
const { NFTStorage, File } = require('nft.storage');

async function uploadImageAndMetadata({ fileUrl, name, symbol, description, extensions }) {
  if (!process.env.NFT_STORAGE_API_KEY) throw new Error('Missing NFT_STORAGE_API_KEY');
  const res = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const client = new NFTStorage({ token: process.env.NFT_STORAGE_API_KEY });
  const file = new File([res.data], 'logo.png', { type: 'image/png' });

  const metadata = await client.store({
    name,
    symbol,
    description,
    image: file,
    extensions: extensions || {}
  });
  return metadata.url.replace('ipfs://', 'https://ipfs.io/ipfs/');
}

module.exports = { uploadImageAndMetadata };
