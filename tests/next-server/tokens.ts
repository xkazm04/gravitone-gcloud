import { __resetJwksCache, __setJwksFetch, SECURETOKEN_JWKS_URL } from "../../lib/principal.ts";

// Firebase-shaped ID tokens signed by a key minted here, and Google's JWKS
// stubbed to serve its public half - the same arrangement
// tests/golden-path/principal.probe.spec.ts uses, so the REAL verifier runs and
// nothing reaches the network.

export const PROJECT = "gravitone-next-server";
export const KID = "next-server-key-1";

const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const b64u = (v: string | Uint8Array): string => Buffer.from(v).toString("base64url");
export const nowS = (): number => Math.floor(Date.now() / 1000);

export type Signer = { sign(claims?: Record<string, unknown>, header?: Record<string, unknown>): Promise<string> };

/** A signer whose public key the stubbed JWKS serves. Sets the project id env. */
export async function installSigner(): Promise<Signer> {
  process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] = PROJECT;
  const pair = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  __resetJwksCache();
  __setJwksFetch(async (url) => {
    if (url !== SECURETOKEN_JWKS_URL) throw new Error(`unexpected JWKS url ${url}`);
    return Response.json({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }, { headers: { "cache-control": "max-age=3600" } });
  });
  return {
    async sign(claims = {}, header = {}) {
      const t = nowS();
      const h = b64u(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT", ...header }));
      const p = b64u(
        JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: "uid-alice", iat: t - 10, auth_time: t - 10, exp: t + 3600, ...claims }),
      );
      const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
      return `${h}.${p}.${b64u(sig)}`;
    },
  };
}

export function uninstallSigner(): void {
  __setJwksFetch(null);
  __resetJwksCache();
}
