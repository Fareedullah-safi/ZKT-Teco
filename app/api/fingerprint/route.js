import {NextResponse} from "next/server";
import dbConnect from "../../../Lib/mongoDB";
import Customer from "../../../Models/Customer";

// ---------- config ----------
const HEALTH_TIMEOUT_MS = 8000;
const SYNC_TIMEOUT_MS = 15000;
const SCAN_TIMEOUT_MS = 70000; // enroll (3 touches)
const IDENTIFY_TIMEOUT_MS = 20000;

// ---------- helpers ----------
function respond(status, code, message, extra = {}) {
  return NextResponse.json({status: "error", code, message, error: message, ...extra}, {status});
}

// The bridge link comes ONLY from the page's input box (x-bridge-url header).
function resolveBridge(request) {
  const raw = (request.headers.get("x-bridge-url") || "").trim();
  if (!raw) {
    return {
      error: respond(
        400,
        "BRIDGE_URL_MISSING",
        "Type the connection link in the box at the top of the page."
      ),
    };
  }

  let u;
  try {
    u = new URL(raw);
  } catch {
    return {error: respond(400, "INVALID_BRIDGE_URL", "The connection link is not a valid URL.")};
  }

  const host = u.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {error: respond(400, "INVALID_BRIDGE_URL", "The link must start with https://")};
  }
  if (u.protocol === "http:" && !isLocal) {
    return {error: respond(400, "INVALID_BRIDGE_URL", "Use an https:// link for a remote bridge.")};
  }
  if (host === "0.0.0.0" || /^169\.254\./.test(host)) {
    return {error: respond(400, "INVALID_BRIDGE_URL", "That address is not allowed.")};
  }

  // origin drops any path (e.g. if someone pastes .../health)
  return {url: u.origin};
}

async function bridgeFetch(baseUrl, path, {method = "GET", body, timeout}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {raw: text.slice(0, 200)};
  }
  return {res, data};
}

function bridgeError(res, data, fallback) {
  const message = data?.message || data?.error || fallback;
  const code = data?.code || "BRIDGE_ERROR";
  const status = res.status >= 400 && res.status < 600 ? res.status : 502;
  return respond(status, code, message);
}

function errorResponse(err) {
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return respond(504, "SCAN_TIMEOUT", "The scanner took too long to respond. Try again.");
  }
  const reason = err?.cause?.code || err?.message || "Unknown error";
  return respond(503, "BRIDGE_UNREACHABLE", reason);
}

// ---------- GET: bridge status ----------
export async function GET(request) {
  const bridge = resolveBridge(request);
  if (bridge.error) {
    return NextResponse.json(
      {status: "offline", code: "BRIDGE_UNREACHABLE", message: "No valid connection link."},
      {status: 503}
    );
  }

  try {
    const {res, data} = await bridgeFetch(bridge.url, "/health", {timeout: HEALTH_TIMEOUT_MS});
    if (res.ok) return NextResponse.json({status: "online", bridge: data});
    return NextResponse.json(
      {status: "offline", code: "BRIDGE_UNREACHABLE", message: `Bridge answered ${res.status}`},
      {status: 503}
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "offline",
        code: "BRIDGE_UNREACHABLE",
        message: err?.cause?.code || err?.message || "Unreachable",
      },
      {status: 503}
    );
  }
}

// ---------- POST: sync / enroll / identify ----------
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return respond(400, "BAD_REQUEST", "Invalid JSON body.");
  }

  const bridge = resolveBridge(request);
  if (bridge.error) return bridge.error;

  const action = body?.action;

  try {
    // ----- SYNC: MongoDB -> bridge memory -----
    if (action === "sync") {
      await dbConnect();
      const customers = await Customer.find({fingerprintTemplate: {$exists: true, $ne: ""}})
        .select("subjectId fingerprintTemplate")
        .lean();

      const records = customers.map((c) => ({
        subjectId: c.subjectId,
        templateBase64: c.fingerprintTemplate,
      }));

      const {res, data} = await bridgeFetch(bridge.url, "/v1/sync", {
        method: "POST",
        body: {records},
        timeout: SYNC_TIMEOUT_MS,
      });
      if (!res.ok) return bridgeError(res, data, "Sync failed.");

      return NextResponse.json({
        status: "success",
        count: data.synced ?? records.length,
        failed: data.failed ?? 0,
      });
    }

    // ----- ENROLL -----
    if (action === "enroll") {
      const subjectId = String(body.subjectId || "").trim();
      const fullName = String(body.fullName || body.name || "").trim();
      if (!subjectId || !fullName) {
        return respond(400, "MISSING_FIELDS", "Subject ID and Full Name are required.");
      }

      await dbConnect();

      const existing = await Customer.findOne({subjectId}).select("fingerprintTemplate").lean();
      if (existing?.fingerprintTemplate) {
        return respond(409, "SUBJECT_EXISTS", "That Subject ID is already enrolled.");
      }

      const {res, data} = await bridgeFetch(bridge.url, "/v1/enroll", {
        method: "POST",
        body: {subjectId},
        timeout: SCAN_TIMEOUT_MS,
      });

      const template = data.templateBase64 || data.template || data.fingerprintTemplate || "";
      console.log("[enroll] bridge replied:", {
        ...data,
        templateBase64: data.templateBase64 ? "<hidden>" : undefined,
        template: data.template ? "<hidden>" : undefined,
      });

      const success =
        res.ok && (data.status === "success" || data.enrolled === true || data.success === true);
      if (!success) return bridgeError(res, data, "Enrollment failed.");

      if (!template) {
        console.log("[enroll] bridge gave no template. Keys:", Object.keys(data));
        return respond(
          502,
          "NO_TEMPLATE",
          "Scanner enrolled, but no template was returned. Nothing was saved."
        );
      }

      const customer = await Customer.findOneAndUpdate(
        {subjectId},
        {
          subjectId,
          fullName,
          phone: body.phone || "",
          email: body.email || "",
          nationality: body.nationality || "",
          address: body.address || "",
          notes: body.notes || "",
          fingerprintTemplate: template,
          enrolledAt: new Date(),
        },
        {returnDocument: "after", upsert: true, setDefaultsOnInsert: true}
      ).select("-fingerprintTemplate");

      return NextResponse.json({
        status: "success",
        subjectId,
        templateSaved: true,
        customer,
      });
    }

    // ----- IDENTIFY -----
    if (action === "identify") {
      const {res, data} = await bridgeFetch(bridge.url, "/v1/identify", {
        method: "POST",
        body: {},
        timeout: IDENTIFY_TIMEOUT_MS,
      });
      console.log("[identify] bridge replied:", data);

      const matched =
        res.ok &&
        data.subjectId &&
        (data.status === "success" ||
          data.matched === true ||
          data.identified === true ||
          data.success === true);
      if (!matched) return bridgeError(res, data, "Fingerprint not recognized.");

      await dbConnect();
      const customer = await Customer.findOneAndUpdate(
        {subjectId: data.subjectId},
        {lastIdentifiedAt: new Date()},
        {returnDocument: "after"}
      ).select("-fingerprintTemplate");

      if (!customer) {
        return respond(
          404,
          "PROFILE_NOT_FOUND",
          `Finger matched (ID: ${data.subjectId}), but no profile exists in MongoDB.`,
          {subjectId: data.subjectId}
        );
      }

      return NextResponse.json({
        status: "success",
        subjectId: data.subjectId,
        score: data.score ?? null,
        customer,
      });
    }

    return respond(400, "UNKNOWN_ACTION", "Unknown action.");
  } catch (err) {
    console.error(`[${action}] error:`, err);
    return errorResponse(err);
  }
}
