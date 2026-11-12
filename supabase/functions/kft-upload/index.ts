// Uploads one product photo for the KFT owner panel.
// Auth: the owner's panel session token (checked via kft_admin_whoami), not Supabase Auth.
// Body: raw image bytes (webp/jpeg/png, <= 2 MB). Returns {url}.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = ["https://hassan973397.github.io", "http://127.0.0.1:8770", "http://localhost:8770"];
const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 2 * 1024 * 1024;

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-kft-token, apikey, authorization",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ error: "طريقة غير مسموحة" }, 405, h);

  const token = req.headers.get("x-kft-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "انتهت الجلسة، سجّل دخول من جديد" }, 401, h);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = TYPES[type];
  if (!ext) return json({ error: "الصورة لازم تكون JPG أو PNG أو WEBP" }, 415, h);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const who = await admin.rpc("kft_admin_whoami", { p_token: token });
  if (who.error || !who.data) return json({ error: "انتهت الجلسة، سجّل دخول من جديد" }, 401, h);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return json({ error: "حجم الصورة لازم يكون أقل من 2 ميغا" }, 413, h);

  const path = `products/${crypto.randomUUID()}.${ext}`;
  const up = await admin.storage.from("kft-products").upload(path, bytes, {
    contentType: type, cacheControl: "31536000", upsert: false,
  });
  if (up.error) return json({ error: "ما گدرنا نرفع الصورة، جرّب مرة ثانية" }, 500, h);
  const url = admin.storage.from("kft-products").getPublicUrl(path).data.publicUrl;
  return json({ url }, 200, h);
});
