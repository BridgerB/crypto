// Minimal Bitcoin Miner - Bare essentials only
// Shows core mining concept in ~80 lines

// Basic crypto utilities
async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function doubleSha256(data) {
  return await sha256(await sha256(data));
}

function hex2bytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytes2hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Get block template from Bitcoin Core
async function getBlockTemplate() {
  const response = await fetch("http://127.0.0.1:8332", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa("bridger:password")}`,
    },
    body: JSON.stringify({
      method: "getblocktemplate",
      params: [{ rules: ["segwit"] }],
      id: 1,
    }),
  });
  return (await response.json()).result;
}

// Create 80-byte block header
function makeHeader(template, nonce) {
  const buf = new ArrayBuffer(80);
  const view = new DataView(buf);

  view.setUint32(0, template.version, true); // version
  new Uint8Array(buf, 4, 32).set(
    hex2bytes(template.previousblockhash).reverse(),
  ); // prev hash
  new Uint8Array(buf, 36, 32).set(hex2bytes("0".repeat(64)).reverse()); // merkle root (dummy)
  view.setUint32(68, template.curtime, true); // time
  new Uint8Array(buf, 72, 4).set(hex2bytes(template.bits).reverse()); // bits
  view.setUint32(76, nonce, true); // nonce

  return new Uint8Array(buf);
}

// Mine!
async function mine() {
  const template = await getBlockTemplate();
  console.log(`Mining block ${template.height}, target: ${template.target}`);

  for (let nonce = 0;; nonce++) {
    const header = makeHeader(template, nonce);
    const hash = bytes2hex(await doubleSha256(header));

    console.log(`${nonce}: ${hash}`);

    if (hash < template.target) {
      console.log(`🎉 FOUND BLOCK! Nonce: ${nonce}`);
      break;
    }
  }
}

mine().catch(console.error);
