import {NextResponse} from "next/server";
import dbConnect from "../../../Lib/mongoDB";
import Customer from "../../../Models/Customer";

// ---------- config ----------
const DEFAULT_BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:8765";
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || ""; // only set if the bridge has the same BRIDGE_TOKEN

const HEALTH_TIMEOUT_MS = 8000;
const SYNC_TIMEOUT_MS = 15000;
const SCAN_TIMEOUT_MS = 70000; // bridge waits up to 20s x 3 touches + lifts
const IDENTIFY_TIMEOUT_MS = 20000;

const ALLOWED_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "[::1]",
  ...(process.env.BRIDGE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
]);
try {
  ALLOWED_HOSTS.add(new URL(DEFAULT_BRIDGE_URL).hostname);
} catch {}

// ---------- helpers ----------
const str = (v) => String(v ?? "").trim();

const pickTemplate = (d) =>
  d?.templateBase64 || d?.template || d?.fingerprintTemplate || d?.data?.template || "";

function getBridgeUrl(req) {
  const raw = req.headers.get("x-bridge-url");
  if (!raw) return DEFAULT_BRIDGE_URL;
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

function bridgeHeaders() {
  const h = {"Content-Type": "application/json"};
  if (BRIDGE_TOKEN) h["X-Bridge-Token"] = BRIDGE_TOKEN;
  return h;
}

async function bridgeFetch(url, path, {method = "POST", body, timeout}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: bridgeHeaders(),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  return {res, data};
}

// Forward the bridge's own error (code, message, status) to the page
function bridgeError(res, data, fallback) {
  return NextResponse.json(
    {
      status: "error",
      code: data.code,
      message: data.message || data.error || fallback,
      ...(data.existingSubjectId ? {existingSubjectId: data.existingSubjectId} : {}),
    },
    {status: res.status >= 400 ? res.status : 422}
  );
}

function errorResponse(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return NextResponse.json(
      {
        status: "error",
        code: "SCAN_TIMEOUT",
        message: "Scan timed out. Place your finger and try again.",
      },
      {status: 504}
    );
  }
  console.error("[fingerprint]", err?.cause?.code || err?.message);
  return NextResponse.json({status: "error", message: err.message}, {status: 500});
}

const invalidUrl = () =>
  NextResponse.json(
    {status: "error", code: "INVALID_BRIDGE_URL", message: "Bridge URL not allowed"},
    {status: 400}
  );

// ---------- GET: health ----------
export async function GET(req) {
  const url = getBridgeUrl(req);
  if (!url) return invalidUrl();

  try {
    const res = await fetch(`${url}/health`, {
      headers: BRIDGE_TOKEN ? {"X-Bridge-Token": BRIDGE_TOKEN} : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({status: "online", bridge: data});
  } catch (error) {
    console.error("[health]", error?.cause?.code || error.message);
    return NextResponse.json(
      {
        status: "offline",
        code: "BRIDGE_UNREACHABLE",
        message: error?.cause?.code || error.message,
      },
      {status: 503}
    );
  }
}

// ---------- POST ----------
export async function POST(req) {
  const url = getBridgeUrl(req);
  if (!url) return invalidUrl();

  try {
    const body = await req.json();
    const {action} = body;

    // ----- sync -----
    if (action === "sync") {
      await dbConnect();
      const customers = await Customer.find({
        fingerprintTemplate: {$nin: [null, ""]},
      })
        .select("subjectId fingerprintTemplate")
        .lean();

      const records = customers.map((c) => ({
        subjectId: c.subjectId,
        templateBase64: c.fingerprintTemplate,
      }));

      const {res, data} = await bridgeFetch(url, "/v1/sync", {
        body: {records},
        timeout: SYNC_TIMEOUT_MS,
      });
      if (!res.ok) return bridgeError(res, data, "Sync failed");
      return NextResponse.json(data);
    }

    // ----- enroll -----
    if (action === "enroll") {
      const subjectId = str(body.subjectId);
      const fullName = str(body.fullName || body.name);

      if (!subjectId || !fullName) {
        return NextResponse.json(
          {status: "error", message: "Subject ID and Full Name are required"},
          {status: 400}
        );
      }

      await dbConnect();

      // Block only if this ID already has a finger saved
      const existing = await Customer.findOne({subjectId}).select("fingerprintTemplate");
      if (existing?.fingerprintTemplate) {
        return NextResponse.json(
          {status: "error", message: "This Subject ID is already registered in MongoDB"},
          {status: 409}
        );
      }

      const {res, data} = await bridgeFetch(url, "/v1/enroll", {
        body: {subjectId},
        timeout: SCAN_TIMEOUT_MS,
      });
      console.log(
        "[enroll] bridge replied:",
        JSON.stringify({
          ...data,
          templateBase64: data.templateBase64 ? "<hidden>" : undefined,
        }).slice(0, 300)
      );

      const ok =
        res.ok && (data.status === "success" || data.enrolled === true || data.success === true);
      if (!ok) return bridgeError(res, data, "Enrollment failed");

      const template = pickTemplate(data);
      if (!template) {
        console.error("[enroll] bridge gave no template. Keys:", Object.keys(data));
      }

      const customer = await Customer.findOneAndUpdate(
        {subjectId},
        {
          subjectId,
          fullName,
          phone: str(body.phone),
          email: str(body.email),
          nationality: str(body.nationality),
          address: str(body.address),
          notes: str(body.notes),
          fingerprintTemplate: template,
          enrolledAt: new Date(),
        },
        {new: true, upsert: true, setDefaultsOnInsert: true}
      ).select("-fingerprintTemplate");

      return NextResponse.json({
        status: "success",
        subjectId,
        templateSaved: Boolean(template),
        customer,
      });
    }

    // ----- identify -----
    if (action === "identify") {
      await dbConnect();

      const {res, data} = await bridgeFetch(url, "/v1/identify", {
        body: {},
        timeout: IDENTIFY_TIMEOUT_MS,
      });
      console.log("[identify] bridge replied:", JSON.stringify(data).slice(0, 300));

      const matchedId = str(data.subjectId || data.id);
      const matched =
        res.ok &&
        matchedId &&
        (data.status === "success" ||
          data.matched === true ||
          data.identified === true ||
          data.success === true);

      if (!matched) return bridgeError(res, data, "No match found");

      const customer = await Customer.findOneAndUpdate(
        {subjectId: matchedId},
        {lastIdentifiedAt: new Date()},
        {new: true}
      ).select("-fingerprintTemplate");

      return NextResponse.json({
        status: "success",
        subjectId: matchedId,
        score: data.score,
        customer,
      });
    }

    return NextResponse.json({status: "error", message: "Unknown action"}, {status: 400});
  } catch (err) {
    return errorResponse(err);
  }
}
