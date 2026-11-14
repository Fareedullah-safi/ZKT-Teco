"use client";

import {useCallback, useEffect, useRef, useState} from "react";

/* ── Toasts ── */
function ToastContainer({toasts, onDismiss}) {
  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({toast, onDismiss}) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration || 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const colors = {
    success: "border-emerald-500/40 from-emerald-500/15 to-emerald-500/5 text-emerald-400",
    error: "border-red-500/40 from-red-500/15 to-red-500/5 text-red-400",
    warning: "border-amber-500/40 from-amber-500/15 to-amber-500/5 text-amber-400",
    info: "border-blue-500/40 from-blue-500/15 to-blue-500/5 text-blue-400",
  };
  const bar = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div
      onClick={() => {
        setExiting(true);
        setTimeout(() => onDismiss(toast.id), 300);
      }}
      className={`pointer-events-auto rounded-xl border bg-gradient-to-br backdrop-blur-md shadow-lg cursor-pointer overflow-hidden
        ${colors[toast.type] || colors.info}
        ${exiting ? "animate-slide-out-right" : "animate-slide-in-right"}`}
    >
      <div className="p-4">
        <strong className="block text-sm font-bold text-slate-100">{toast.title}</strong>
        {toast.message && (
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <div className="h-0.5 bg-white/5">
        <div
          className={`h-full ${bar[toast.type] || bar.info} animate-progress-bar`}
          style={{animationDuration: `${toast.duration || 5000}ms`}}
        />
      </div>
    </div>
  );
}

/* ── Fingerprint visual ── */
function FingerprintScanner({state, scanStep, scanTotal}) {
  const scanning = state === "scanning";
  const success = state === "success";
  const error = state === "error";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`relative w-40 h-48 rounded-3xl border-2 flex items-center justify-center overflow-hidden transition-all
          ${scanning ? "border-indigo-500 shadow-[0_0_24px_rgba(99,102,241,0.35)]" : ""}
          ${success ? "border-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.35)]" : ""}
          ${error ? "border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.35)] animate-shake" : ""}
          ${!scanning && !success && !error ? "border-white/10 bg-white/5" : "bg-bgPrimary/40"}`}
      >
        {scanning && (
          <div className="absolute left-[10%] right-[10%] h-[3px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan z-10" />
        )}

        <svg
          viewBox="0 0 100 100"
          className={`w-24 h-24 ${
            scanning
              ? "text-indigo-400"
              : success
                ? "text-emerald-500/40"
                : error
                  ? "text-red-500/40"
                  : "text-indigo-300/50"
          }`}
        >
          <path
            d="M50 15C30 15 18 30 18 50s12 35 32 35 32-15 32-35S70 15 50 15z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            opacity=".3"
          />
          <path
            d="M50 25C36 25 28 36 28 50s8 25 22 25 22-11 22-25-8-25-22-25z"
            stroke="currentColor"
            strokeWidth="1.3"
            fill="none"
            opacity=".45"
          />
          <path
            d="M50 35C42 35 38 42 38 50s4 15 12 15 12-7 12-15-4-15-12-15z"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            opacity=".6"
          />
          <ellipse
            cx="50"
            cy="50"
            rx="4"
            ry="5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            opacity=".8"
          />
        </svg>

        {success && (
          <div className="absolute inset-0 bg-bgPrimary/50 flex items-center justify-center">
            <svg viewBox="0 0 52 52" className="w-14 h-14 text-emerald-400 animate-success-pop">
              <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <path
                d="M14 27l8 8 16-16"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 bg-bgPrimary/50 flex items-center justify-center">
            <svg viewBox="0 0 52 52" className="w-14 h-14 text-red-400 animate-success-pop">
              <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <path
                d="M18 18l16 16M34 18l-16 16"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      {scanning && scanTotal > 0 && (
        <div className="flex gap-2">
          {Array.from({length: scanTotal}, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full border-2 ${
                i < scanStep
                  ? "bg-indigo-500 border-indigo-500"
                  : i === scanStep
                    ? "border-indigo-400 animate-pulse"
                    : "border-white/20"
              }`}
            />
          ))}
        </div>
      )}

      <p
        className={`text-sm font-medium text-center px-2 ${
          scanning
            ? "text-indigo-300"
            : success
              ? "text-emerald-400"
              : error
                ? "text-red-400"
                : "text-slate-500"
        }`}
      >
        {state === "idle" && "Ready to scan"}
        {scanning &&
          (scanTotal > 1 ? `Place finger… ${scanStep}/${scanTotal}` : "Place finger on scanner…")}
        {success && "Success!"}
        {error && "Failed — see toast"}
      </p>
    </div>
  );
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// CHANGED: hint now matches the new run-server.bat setup
const BRIDGE_HINT =
  "Start the bridge: double-click run-server.bat in the fingerprint-server folder.";

// Exact-code toasts for the route/bridge
const CODE_TOASTS = {
  SUBJECT_EXISTS: {
    type: "warning",
    title: "Duplicate Subject ID",
    message: "That Subject ID is already enrolled. Use a new ID like CUST_002.",
  },
  DUPLICATE_FINGER: {
    type: "warning",
    title: "Finger Already Enrolled",
    message: "This finger is already registered to another subject.",
  },
  INVALID_SUBJECT_ID: {
    type: "warning",
    title: "Invalid Subject ID",
    message: "Use only letters, numbers, '_' and '-' (max 64 characters). No spaces.",
  },
  NO_FINGER: {
    type: "warning",
    title: "No Finger Detected",
    message: "Click Start, then place your finger on the scanner within 10 seconds.",
  },
  LIFT_TIMEOUT: {
    type: "warning",
    title: "Finger Not Lifted",
    message: "Lift your finger completely off the scanner between each touch.",
  },
  FINGERPRINT_NOT_FOUND: {
    type: "error",
    title: "No Match",
    message: "Fingerprint is not enrolled yet. Enroll this person first.",
  },
  BRIDGE_TIMEOUT: {
    type: "error",
    title: "Scanner Bridge Timed Out",
    message: "The scanner bridge took too long to respond. Try again.",
  },
  SCANNER_DISCONNECTED: {
    type: "error",
    title: "Scanner Not Connected",
    message: "Unplug USB → wait 3s → replug → restart the Java bridge.",
  },
  UNAUTHORIZED: {
    type: "error",
    title: "Bridge Auth Failed",
    message: "BRIDGE_TOKEN in .env.local must match the one the Java bridge was started with.",
  },
};

/** Map API / hardware errors → clear toast text */
function getErrorToast(data, fallbackTitle = "Error") {
  const code = data?.code || "";
  const raw = data?.message || data?.error || "Unknown error";

  // exact error codes win over the regex matching below
  if (CODE_TOASTS[code]) return CODE_TOASTS[code];

  if (code === "DUPLICATE_SUBJECT_ID" || /already exists/i.test(raw)) {
    return {
      type: "warning",
      title: "Duplicate Subject ID",
      message: raw || "That Subject ID is already enrolled. Use a new ID like CUST_002.",
    };
  }
  if (
    code === "BRIDGE_OFFLINE" ||
    code === "BRIDGE_UNREACHABLE" ||
    /bridge|8765|offline/i.test(raw)
  ) {
    return {
      type: "error",
      title: "Scanner Bridge Offline",
      message: BRIDGE_HINT,
    };
  }
  if (code === "DATABASE_OFFLINE" || /mongo|database/i.test(raw)) {
    return {
      type: "error",
      title: "Database Offline",
      message: "Check MONGODB_URI in .env.local and that MongoDB is running.",
    };
  }
  if (/timeout|timed out|place finger/i.test(raw)) {
    return {
      type: "warning",
      title: "Scan Timed Out",
      message:
        "Click Enroll, then place the SAME finger 3 times. Lift completely between each touch.",
    };
  }
  if (/merge|did not match|scans did not|quality|flat/i.test(raw)) {
    return {
      type: "warning",
      title: "Scans Did Not Match",
      message:
        "Use the same finger, keep it flat and still, lift off between each of the 3 touches.",
    };
  }
  if (/hardware|device|unplugged|OpenDevice|reader/i.test(raw)) {
    return {
      type: "error",
      title: "Hardware Error",
      message:
        raw || "ZK9500 busy or unplugged. Unplug USB → wait 3s → replug → restart Java bridge.",
    };
  }
  if (code === "FINGERPRINT_NOT_RECOGNIZED" || /not found|not recognized/i.test(raw)) {
    return {
      type: "error",
      title: "No Match",
      message: "Fingerprint is not enrolled yet. Enroll this person first.",
    };
  }
  if (code === "PROFILE_NOT_FOUND") {
    return {
      type: "warning",
      title: "Profile Missing in MongoDB",
      message:
        raw || "Finger matched scanner memory, but no customer profile exists in the database.",
    };
  }

  return {
    type: "error",
    title: fallbackTitle,
    message: raw,
  };
}

// Default demo data so the form is never empty
const defaultForm = {
  subjectId: "CUST_001",
  fullName: "John Doe",
  phone: "0300-1234567",
  email: "john.doe@email.com",
  nationality: "Pakistani",
  address: "Lahore, Pakistan",
  notes: "Demo customer — replace with real data",
};

const emptyForm = {
  subjectId: "",
  fullName: "",
  phone: "",
  email: "",
  nationality: "",
  address: "",
  notes: "",
};

export default function HomePage() {
  // CHANGED: default comes from .env.local (NEXT_PUBLIC_BRIDGE_URL), still editable
  const [bridgeUrl, setBridgeUrl] = useState(
    process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:8765"
  );
  const [connected, setConnected] = useState(null);
  const [activeTab, setActiveTab] = useState("enroll");
  const [form, setForm] = useState(defaultForm);
  const [busy, setBusy] = useState(false);
  const [scannerState, setScannerState] = useState("idle");
  const [scanStep, setScanStep] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [matchedCustomer, setMatchedCustomer] = useState(null);
  const [matchScore, setMatchScore] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const toastId = useRef(0);
  const didSync = useRef(false);

  const addToast = useCallback((type, title, message, duration = 5500) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, {id, type, title, message, duration}]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "x-bridge-url": bridgeUrl,
    }),
    [bridgeUrl]
  );

  // Live bridge status
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/fingerprint?action=status", {
          headers: headers(),
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) {
          const online = res.ok && data.status !== "offline" && !data.error;
          setConnected(online);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    check();
    const t = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [headers]);

  // (CHANGED: removed the unused second `check` function that used `cancelled` out of scope)

  // Auto-sync templates from MongoDB → Java RAM when bridge comes online
  useEffect(() => {
    if (!connected || didSync.current) return;
    let cancelled = false;

    const runSync = async () => {
      setSyncing(true);
      try {
        const res = await fetch("/api/fingerprint", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({action: "sync"}),
        });
        const data = await res.json();
        if (!cancelled) {
          didSync.current = true;
          if (res.ok) {
            addToast(
              "info",
              "Templates Synced",
              data.count != null
                ? `Restored ${data.count} fingerprint(s) from MongoDB to scanner.`
                : "Scanner memory synced from MongoDB."
            );
          }
        }
      } catch {
        // silent — bridge may still be starting
      } finally {
        if (!cancelled) setSyncing(false);
      }
    };

    runSync();
    return () => {
      cancelled = true;
    };
  }, [connected, headers, addToast]);

  // Fake progress dots while enroll request is in flight (bridge does real 1/2/3)
  useEffect(() => {
    if (!busy || scanTotal < 3) return;
    setScanStep(0);
    const t1 = setTimeout(() => setScanStep(1), 2000);
    const t2 = setTimeout(() => setScanStep(2), 5000);
    const t3 = setTimeout(() => setScanStep(3), 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [busy, scanTotal]);

  // ── IDENTIFY ──
  const handleIdentify = async () => {
    setBusy(true);
    setScannerState("scanning");
    setScanStep(0);
    setScanTotal(1);
    setMatchedCustomer(null);
    setMatchScore(null);

    try {
      const res = await fetch("/api/fingerprint", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({action: "identify"}),
      });
      const data = await res.json();

      // Accept all shapes: { success }, { matched } or { status: "success" }
      const customer = data.customer;
      // CHANGED: also accept data.status === "success" (what the route returns)
      const ok = res.ok && customer && (data.success || data.matched || data.status === "success");

      if (ok) {
        setScannerState("success");
        setMatchedCustomer(customer);
        setMatchScore(data.score ?? data.matchScore ?? null);
        addToast("success", "Identity Verified", `Welcome, ${customer.fullName}!`);
      } else if ((data.matched || data.subjectId) && !customer) {
        setScannerState("error");
        const t = getErrorToast(
          {
            code: "PROFILE_NOT_FOUND",
            message:
              data.error ||
              data.message ||
              `Finger matched (ID: ${data.subjectId}), but no MongoDB profile found.`,
          },
          "Partial Match"
        );
        addToast(t.type, t.title, t.message);
      } else {
        setScannerState("error");
        const t = getErrorToast(data, "No Match");
        addToast(t.type, t.title, t.message);
      }
    } catch (err) {
      setScannerState("error");
      addToast("error", "Network Error", err.message || "Could not reach API.");
    } finally {
      setBusy(false);
      setTimeout(() => setScannerState("idle"), 3500);
    }
  };

  // ── ENROLL ──
  const handleEnroll = async (e) => {
    e.preventDefault();
    if (!form.subjectId.trim() || !form.fullName.trim()) {
      addToast("warning", "Missing fields", "Subject ID and Full Name are required.");
      return;
    }

    setBusy(true);
    setScannerState("scanning");
    setScanStep(0);
    setScanTotal(3);
    setMatchedCustomer(null);

    addToast(
      "info",
      "Enrollment Started",
      "Place the SAME finger on the scanner 3 times. Lift completely between each touch.",
      8000
    );

    try {
      const res = await fetch("/api/fingerprint", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({action: "enroll", ...form}),
      });
      const data = await res.json();

      if (res.ok && (data.success || data.customer)) {
        setScannerState("success");
        setScanStep(3);
        if (data.customer) setMatchedCustomer(data.customer);

        if (data.partial) {
          addToast(
            "warning",
            "Profile Saved (Partial)",
            data.warning || data.message || "Saved to MongoDB, but fingerprint scan was incomplete."
          );
        } else {
          addToast(
            "success",
            "Enrollment Complete",
            data.message || `${form.fullName} saved to MongoDB + scanner!`
          );
        }

        // Next customer defaults
        const nextNum = String(Date.now()).slice(-4);
        setForm({
          ...defaultForm,
          subjectId: `CUST_${nextNum}`,
          fullName: "",
          phone: "",
          email: "",
          notes: "",
        });
      } else {
        setScannerState("error");
        const t = getErrorToast(data, "Enrollment Error");
        addToast(t.type, t.title, t.message, 7000);
      }
    } catch (err) {
      setScannerState("error");
      addToast("error", "Network Error", err.message || "Could not reach API / bridge.");
    } finally {
      setBusy(false);
      setTimeout(() => setScannerState("idle"), 4000);
    }
  };

  const fillDemo = () => {
    const n = String(Date.now()).slice(-4);
    setForm({
      subjectId: `CUST_${n}`,
      fullName: "John Doe",
      phone: "0300-1234567",
      email: "john.doe@email.com",
      nationality: "Pakistani",
      address: "Lahore, Pakistan",
      notes: "Demo customer",
    });
    addToast("info", "Demo Data Loaded", `Subject ID set to CUST_${n}`);
  };

  const inputClass =
    "w-full bg-bgInput border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50";

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="fixed -top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
      <div className="fixed inset-0 bg-grid-overlay pointer-events-none" />

      <header className="sticky top-0 z-50 border-b border-white/5 bg-bgPrimary/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-extrabold bg-gradient-to-br from-indigo-300 to-indigo-500 bg-clip-text text-transparent">
              BioID
            </h1>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Fingerprint Identity
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={bridgeUrl}
              onChange={(e) => {
                setBridgeUrl(e.target.value);
                didSync.current = false;
              }}
              className="bg-bgInput border border-white/10 rounded-md text-xs px-3 py-1.5 w-56 font-mono text-slate-200 outline-none focus:border-indigo-500"
              placeholder="http://127.0.0.1:8765"
            />
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                connected === true
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : connected === false
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected === true
                    ? "bg-emerald-500"
                    : connected === false
                      ? "bg-red-500"
                      : "bg-amber-500 animate-pulse"
                }`}
              />
              {connected === true
                ? syncing
                  ? "Syncing…"
                  : "Scanner Online"
                : connected === false
                  ? "Offline"
                  : "Checking…"}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* LEFT */}
        <section>
          <div className="flex gap-1 p-1 bg-bgCard border border-white/5 rounded-2xl mb-6">
            {["identify", "enroll"].map((tab) => (
              <button
                key={tab}
                disabled={busy}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${
                  activeTab === tab
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                } disabled:opacity-50`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="bg-bgCard border border-white/5 rounded-3xl p-6 sm:p-8 shadow-xl">
            {activeTab === "identify" ? (
              <>
                <h2 className="text-xl font-bold mb-1">Verify Identity</h2>
                <p className="text-sm text-slate-400 mb-8">
                  Scan finger → load profile from MongoDB
                </p>
                <div className="py-4 mb-8">
                  <FingerprintScanner
                    state={scannerState}
                    scanStep={scanStep}
                    scanTotal={scanTotal}
                  />
                </div>
                <button
                  onClick={handleIdentify}
                  disabled={busy || !connected}
                  className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? "Scanning…" : "Start Identification"}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-bold mb-1">Enroll Customer</h2>
                    <p className="text-sm text-slate-400">
                      Save profile to MongoDB + fingerprint on scanner
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fillDemo}
                    disabled={busy}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    Fill Demo
                  </button>
                </div>

                <form onSubmit={handleEnroll} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Subject ID *
                      </label>
                      <input
                        className={inputClass}
                        required
                        disabled={busy}
                        value={form.subjectId}
                        onChange={(e) => setForm({...form, subjectId: e.target.value})}
                        placeholder="CUST_001"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Full Name *
                      </label>
                      <input
                        className={inputClass}
                        required
                        disabled={busy}
                        value={form.fullName}
                        onChange={(e) => setForm({...form, fullName: e.target.value})}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Phone
                      </label>
                      <input
                        className={inputClass}
                        disabled={busy}
                        value={form.phone}
                        onChange={(e) => setForm({...form, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Email
                      </label>
                      <input
                        type="email"
                        className={inputClass}
                        disabled={busy}
                        value={form.email}
                        onChange={(e) => setForm({...form, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Nationality
                      </label>
                      <input
                        className={inputClass}
                        disabled={busy}
                        value={form.nationality}
                        onChange={(e) => setForm({...form, nationality: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 uppercase">
                        Address
                      </label>
                      <input
                        className={inputClass}
                        disabled={busy}
                        value={form.address}
                        onChange={(e) => setForm({...form, address: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      className={inputClass}
                      disabled={busy}
                      value={form.notes}
                      onChange={(e) => setForm({...form, notes: e.target.value})}
                    />
                  </div>

                  {busy && (
                    <div className="py-4">
                      <FingerprintScanner
                        state={scannerState}
                        scanStep={scanStep}
                        scanTotal={scanTotal}
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy || !connected}
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/30 disabled:opacity-50"
                  >
                    {busy ? "Enrolling… place finger 3 times" : "Enroll & Save to MongoDB"}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

        {/* RIGHT */}
        <section>
          {matchedCustomer ? (
            <div className="bg-bgCard border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_40px_rgba(16,185,129,0.08)] animate-fade-in-up">
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-lg font-black text-white">
                  {matchedCustomer.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold truncate">{matchedCustomer.fullName}</h2>
                  <span className="inline-block mt-1 font-mono text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                    {matchedCustomer.subjectId}
                  </span>
                </div>
                {matchScore != null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-bold">
                    Score: {matchScore}
                  </div>
                )}
              </div>

              <hr className="border-white/5 mb-5" />

              <div className="space-y-3 text-sm">
                {[
                  ["Phone", matchedCustomer.phone],
                  ["Email", matchedCustomer.email],
                  ["Nationality", matchedCustomer.nationality],
                  ["Address", matchedCustomer.address],
                  ["Enrolled", formatDate(matchedCustomer.enrolledAt)],
                  ["Last Seen", formatDate(matchedCustomer.lastIdentifiedAt)],
                ].map(
                  ([label, value]) =>
                    value &&
                    value !== "—" && (
                      <div
                        key={label}
                        className="flex justify-between gap-4 py-2 border-b border-white/5 last:border-0"
                      >
                        <span className="text-slate-400">{label}</span>
                        <span className="text-slate-100 text-right font-medium">{value}</span>
                      </div>
                    )
                )}
                {matchedCustomer.notes && (
                  <div className="pt-2">
                    <span className="text-slate-400 text-xs">Notes</span>
                    <p className="mt-1 text-slate-300 bg-bgInput border border-white/5 rounded-xl p-3">
                      {matchedCustomer.notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-14 bg-bgCard border border-dashed border-white/10 rounded-3xl gap-3">
              <p className="text-4xl opacity-40">👆</p>
              <h3 className="text-lg font-bold text-slate-300">No profile loaded</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Identify a finger or enroll a customer. Data is loaded from MongoDB only after a
                match.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
