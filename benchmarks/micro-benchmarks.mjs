import crypto from "node:crypto";

const iterations = Number(process.argv[2] ?? 250_000); 
const loops = Number(process.argv[3] ?? 200);
const keylen = 64;
console.log(process.pid);
console.log(`PBKDF2 sync: iterations=${iterations}, loops=${loops}`);

const t0 = Date.now();
for (let i = 0; i < loops; i++) {
  crypto.pbkdf2Sync("password", "salt", iterations, keylen, "sha512");
}
const dt = (Date.now() - t0) / 1000;

console.log(`Done in ${dt.toFixed(2)}s`);
console.log(`Ops/sec ~ ${(loops / dt).toFixed(2)}`);