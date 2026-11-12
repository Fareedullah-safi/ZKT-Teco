const bridgeBase = (process.env.FINGERPRINT_BRIDGE_URL || "http://127.0.0.1:8765").replace(
  /\/+$/,
  ""
);

async function forward(path, method, body) {
  try {
    const bridgeResponse = await fetch(`${bridgeBase}${path}`, {
      method,
      cache: "no-store",
      ...(body === undefined
        ? {}
        : {
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
          }),
    });

    const text = await bridgeResponse.text();

    return new Response(text || null, {
      status: bridgeResponse.status,
      headers: {
        "Content-Type": bridgeResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      {
        error: `Cannot reach the Java fingerprint bridge at ${bridgeBase}. Make sure it is running. ${message}`,
      },
      {status: 502}
    );
  }
}

export async function GET(request) {
  const action = new URL(request.url).searchParams.get("action");

  return forward(action === "status" ? "/status" : "/health", "GET");
}

export async function POST(request) {
  let data;

  try {
    data = await request.json();
  } catch {
    return Response.json({error: "Invalid JSON request."}, {status: 400});
  }

  if (data?.action === "enroll") {
    const subjectId = String(data.subjectId || "").trim();

    if (!subjectId) {
      return Response.json({error: "Enter a subject ID before enrolling."}, {status: 400});
    }

    return forward("/v1/enroll", "POST", {subjectId});
  }

  if (data?.action === "identify") {
    return forward("/v1/identify", "POST", {});
  }

  return Response.json({error: "Unknown fingerprint action."}, {status: 400});
}
