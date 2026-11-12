import {NextResponse} from "next/server";

export async function GET(req) {
  const {searchParams} = new URL(req.url);
  const action = searchParams.get("action");

  // Get the bridge URL sent from this specific user's browser
  const customBridge = req.headers.get("x-bridge-url");
  const bridgeUrl = (
    customBridge ||
    process.env.FINGERPRINT_BRIDGE_URL ||
    "http://127.0.0.1:8765"
  ).replace(/\/+$/, "");

  const path = action === "status" ? "/status" : "/health";

  try {
    const res = await fetch(`${bridgeUrl}${path}`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
    });
    const data = await res.json();
    return NextResponse.json(data, {status: res.status});
  } catch (err) {
    return NextResponse.json(
      {
        error: `Cannot reach Java Bridge at ${bridgeUrl}. Make sure run-server.bat is running. (${err.message})`,
      },
      {status: 502}
    );
  }
}

export async function POST(req) {
  const customBridge = req.headers.get("x-bridge-url");
  const bridgeUrl = (
    customBridge ||
    process.env.FINGERPRINT_BRIDGE_URL ||
    "http://127.0.0.1:8765"
  ).replace(/\/+$/, "");

  try {
    const body = await req.json();
    let path = "";
    let payload = {};

    if (body.action === "enroll") {
      if (!body.subjectId) {
        return NextResponse.json({error: "Missing subjectId"}, {status: 400});
      }
      path = "/v1/enroll";
      payload = {subjectId: body.subjectId};
    } else if (body.action === "identify") {
      path = "/v1/identify";
      payload = {};
    } else {
      return NextResponse.json({error: "Invalid action"}, {status: 400});
    }

    const res = await fetch(`${bridgeUrl}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json(data, {status: res.status});
  } catch (err) {
    return NextResponse.json(
      {error: `Cannot reach Java Bridge at ${bridgeUrl}. (${err.message})`},
      {status: 502}
    );
  }
}
