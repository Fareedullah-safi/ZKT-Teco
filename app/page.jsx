"use client";

import {useEffect, useState} from "react";

const STORAGE_KEY = "zk9500-user-profiles-v1";

const INITIAL_FORM = {
  subjectId: "",
  fullName: "",
  phone: "",
  email: "",
  nationality: "",
  address: "",
  notes: "",
};

function formatDate(isoString) {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export default function Home() {
  const [bridgeUrl, setBridgeUrl] = useState("http://127.0.0.1:8765");
  const [form, setForm] = useState({...INITIAL_FORM});
  const [profiles, setProfiles] = useState([]);
  const [storageReady, setStorageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready. Place finger on reader when scanning.");
  const [matchedProfile, setMatchedProfile] = useState(null);
  const [matchResult, setMatchResult] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setProfiles(parsed);
        }
      }
    } catch (err) {
      console.error("Could not read from localStorage:", err);
    } finally {
      setStorageReady(true);
    }
  }, []);

  function handleInputChange(e) {
    const {name, value} = e.target;
    setForm((prev) => ({...prev, [name]: value}));
  }

  function saveProfilesToStorage(updatedProfiles) {
    setProfiles(updatedProfiles);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfiles));
    } catch (err) {
      console.error("Failed to save to localStorage:", err);
    }
  }

  async function runAction(action) {
    const enteredId = form.subjectId.trim();

    if (action === "enroll") {
      if (!enteredId) {
        setStatus("Please enter a User / Customer ID before enrolling.");
        return;
      }
      if (!form.fullName.trim()) {
        setStatus("Please enter the Full Name before enrolling.");
        return;
      }
    }

    setBusy(true);
    setMatchedProfile(null);
    setMatchResult(null);

    if (action === "health") {
      setStatus("Checking fingerprint reader connection...");
    } else if (action === "enroll") {
      setStatus("Starting enrollment. Place and lift the SAME finger 3 times...");
    } else if (action === "identify") {
      setStatus("Scanning... Place your finger on the reader.");
    }

    let isPolling = action !== "health";
    let pollInterval = null;

    // Send the user's specific bridge URL in custom header
    const headers = {
      "Content-Type": "application/json",
      "x-bridge-url": bridgeUrl.trim(),
    };

    if (isPolling) {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch("/api/fingerprint?action=status", {
            cache: "no-store",
            headers,
          });
          const data = await res.json();
          if (data && data.status) {
            setStatus(data.status);
          }
        } catch {
          // Ignore polling errors
        }
      }, 400);
    }

    try {
      let res;

      if (action === "health") {
        res = await fetch("/api/fingerprint", {
          cache: "no-store",
          headers,
        });
      } else {
        const body =
          action === "enroll" ? {action: "enroll", subjectId: enteredId} : {action: "identify"};
        res = await fetch("/api/fingerprint", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Operation failed.");
      }

      if (action === "health") {
        if (data.readerConnected) {
          setStatus(`Reader Connected! Found ${data.deviceCount} device(s).`);
        } else {
          setStatus("Java Bridge is running, but USB reader is disconnected.");
        }
      } else if (action === "enroll") {
        if (data.enrolled) {
          const now = new Date().toISOString();
          const newProfile = {
            subjectId: enteredId,
            fullName: form.fullName.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            nationality: form.nationality.trim(),
            address: form.address.trim(),
            notes: form.notes.trim(),
            enrolledAt: now,
            lastIdentifiedAt: null,
          };

          const updated = [newProfile, ...profiles.filter((p) => p.subjectId !== enteredId)];
          saveProfilesToStorage(updated);

          setStatus(`Successfully enrolled fingerprint for ${enteredId}! Profile saved.`);
          setForm({...INITIAL_FORM});
        }
      } else if (action === "identify") {
        setMatchResult(data);

        if (data.matched && data.subjectId) {
          const foundId = String(data.subjectId).trim();
          const userProfile = profiles.find((p) => p.subjectId === foundId);

          if (userProfile) {
            const now = new Date().toISOString();
            const updatedProfile = {...userProfile, lastIdentifiedAt: now};

            const updatedList = profiles.map((p) => (p.subjectId === foundId ? updatedProfile : p));
            saveProfilesToStorage(updatedList);

            setMatchedProfile(updatedProfile);
            setStatus(`MATCH FOUND! Showing stored data for ID: ${foundId}`);
          } else {
            setStatus(
              `Fingerprint matched ID "${foundId}", but no profile data was found in local storage.`
            );
          }
        } else {
          setStatus("No matching fingerprint found. Please enroll first.");
        }
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      if (pollInterval) clearInterval(pollInterval);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800">ZK9500 Fingerprint System</h1>
          <p className="text-sm text-slate-600 mt-1">
            Enroll user data with fingerprint, or scan finger to retrieve stored details.
          </p>
        </div>

        {/* Bridge URL Input */}
        <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
            Scanner Bridge URL for this PC
          </label>
          <input
            type="text"
            value={bridgeUrl}
            onChange={(e) => setBridgeUrl(e.target.value)}
            disabled={busy}
            placeholder="http://127.0.0.1:8765 or https://your-tunnel.loca.lt"
            className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
          />
          <p className="text-xs text-slate-500 mt-1">
            Each user sets their own bridge/tunnel URL here. (Default:{" "}
            <code>http://127.0.0.1:8765</code>).
          </p>
        </div>

        {/* Status Bar */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-blue-900 font-medium">
          <span className="font-bold">Status: </span> {status}
        </div>

        {/* Form: Add / Enroll User Data */}
        <section className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 text-slate-800">1. Enroll New User Data</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700">
                User / Customer ID *
              </label>
              <input
                type="text"
                name="subjectId"
                value={form.subjectId}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="e.g. CUST-101"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="e.g. John Doe"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Phone Number</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="+1 234 567 890"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="john@example.com"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Nationality</label>
              <input
                type="text"
                name="nationality"
                value={form.nationality}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="e.g. American"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700">Address</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleInputChange}
                disabled={busy}
                placeholder="123 Street Name"
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700">
                Notes / Description
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleInputChange}
                disabled={busy}
                rows={2}
                placeholder="Additional notes..."
                className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => runAction("health")}
              disabled={busy}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Check Reader
            </button>

            <button
              type="button"
              onClick={() => runAction("enroll")}
              disabled={busy || !storageReady}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Enroll Fingerprint
            </button>
          </div>
        </section>

        {/* Section 2: Identify via Fingerprint */}
        <section className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-2 text-slate-800">
            2. Fetch User Data with Fingerprint
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Click below and place finger on scanner to display the user&apos;s full profile.
          </p>

          <button
            type="button"
            onClick={() => runAction("identify")}
            disabled={busy || !storageReady}
            className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50 text-base"
          >
            Identify & Fetch Data
          </button>
        </section>

        {/* Section 3: MATCH DISPLAYED RESULT */}
        {matchedProfile && (
          <section className="rounded-2xl border-2 border-green-500 bg-green-50/50 p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-green-200 pb-3 mb-4">
              <h2 className="text-xl font-bold text-green-900">User Profile Matched!</h2>
              <span className="rounded-full bg-green-200 px-3 py-1 text-xs font-bold text-green-800">
                Score: {matchResult?.score ?? "N/A"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-800">
              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">User ID</span>
                <p className="font-semibold text-base text-slate-900">{matchedProfile.subjectId}</p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">Full Name</span>
                <p className="font-semibold text-base text-slate-900">{matchedProfile.fullName}</p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">Phone</span>
                <p className="font-medium">{matchedProfile.phone || "Not provided"}</p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">Email</span>
                <p className="font-medium">{matchedProfile.email || "Not provided"}</p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">
                  Nationality
                </span>
                <p className="font-medium">{matchedProfile.nationality || "Not provided"}</p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">Address</span>
                <p className="font-medium">{matchedProfile.address || "Not provided"}</p>
              </div>

              <div className="md:col-span-2">
                <span className="text-xs text-slate-500 uppercase font-bold block">
                  Notes / Description
                </span>
                <p className="font-medium bg-white p-3 rounded-lg border border-slate-200 mt-1">
                  {matchedProfile.notes || "No notes available."}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-500 uppercase font-bold block">
                  Enrolled Date
                </span>
                <p className="text-xs text-slate-600">{formatDate(matchedProfile.enrolledAt)}</p>
              </div>

              <div>
                <span className="text-xs text-slate-600 uppercase font-bold block">
                  Last Scanned Date
                </span>
                <p className="text-xs text-slate-600">
                  {formatDate(matchedProfile.lastIdentifiedAt)}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
