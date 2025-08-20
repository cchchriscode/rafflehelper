import React, { useMemo, useState } from "react";

// Raffle Assistant — single-file React app (Canvas-ready)
// Features:
// 1) Set total number of spots
// 2) Add participants with fixed picks and random count
// 3) Detect conflicts on fixed picks and alert user to fix
// 4) Randoms only applied when clicking "Assign randoms"
// 5) Export CSV
// 6) Reset removes only randoms, not participants
// 7) Randoms assigned randomly among available spots
// 8) Show assigned random numbers beside participant random count

// --- Helpers ---
function parseSpotList(input) {
  if (!input.trim()) return [];
  const parts = input
    .split(/[ ,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    const m = p.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        const [start, end] = a <= b ? [a, b] : [b, a];
        for (let i = start; i <= end; i++) out.add(i);
      }
      continue;
    }
    const n = parseInt(p, 10);
    if (!Number.isNaN(n)) out.add(n);
  }
  return Array.from(out).sort((x, y) => x - y);
}

function toCSV(rows) {
  const header = "Spot #,Name";
  const lines = rows.map((r) => `${r.spot},${r.name ? '"' + r.name.replaceAll('"', '""') + '"' : ''}`);
  return [header, ...lines].join("\n");
}

export default function RaffleAssistantApp() {
  const [totalSpots, setTotalSpots] = useState(100);

  const [name, setName] = useState("");
  const [fixedText, setFixedText] = useState("");
  const [randomCount, setRandomCount] = useState(0);

  const [participants, setParticipants] = useState([]);
  const [assigned, setAssigned] = useState(new Map()); // final (fixed + randoms) after Assign
  const [randomAssignments, setRandomAssignments] = useState({}); // by participant.id -> [spots]
  const [randomsAssigned, setRandomsAssigned] = useState(false);

  // Compute first-come-first-serve fixed claims and conflicts
  const { conflicts, fixedClaims, allFixedValid } = useMemo(() => {
    const claims = new Map();
    const allConflicts = [];

    for (const p of participants) {
      for (const spot of p.fixedSpots || []) {
        if (spot < 1 || spot > totalSpots) continue; // ignore out-of-bounds
        const claimedBy = claims.get(spot);
        if (!claimedBy) {
          claims.set(spot, p.name);
        } else if (claimedBy !== p.name) {
          allConflicts.push({ spot, first: claimedBy, later: p.name });
        }
      }
    }

    return {
      conflicts: allConflicts,
      fixedClaims: claims,
      allFixedValid: allConflicts.length === 0,
    };
  }, [participants, totalSpots]);

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildAssignment() {
    // Returns { map, randomMap }
    const map = new Map();
    const randomMap = {};
    if (!allFixedValid) return { map, randomMap };

    // 1) Place fixed (first-come-first-serve across participants order)
    for (const p of participants) {
      for (const s of p.fixedSpots || []) {
        if (s >= 1 && s <= totalSpots && !map.has(s)) map.set(s, p.name);
      }
    }

    // 2) Randoms — among remaining spots, fully randomized
    let available = [];
    for (let i = 1; i <= totalSpots; i++) if (!map.has(i)) available.push(i);
    available = shuffle(available);

    let idx = 0;
    for (const p of participants) {
      randomMap[p.id] = [];
      for (let k = 0; k < (p.randomCount || 0); k++) {
        if (idx < available.length) {
          const spotNo = available[idx];
          map.set(spotNo, p.name);
          randomMap[p.id].push(spotNo);
          idx++;
        }
      }
    }
    return { map, randomMap };
  }

  function addParticipant() {
    if (!name.trim()) return alert("Please enter a participant name.");

    const fixed = parseSpotList(fixedText).filter((s) => s >= 1 && s <= totalSpots);

    const newP = {
      id: Math.random().toString(36).slice(2),
      name: name.trim(),
      fixedSpots: Array.from(new Set(fixed)).sort((a, b) => a - b),
      randomCount: Math.max(0, Math.floor(Number(randomCount) || 0)),
    };

    setParticipants((prev) => [...prev, newP]);
    setName("");
    setFixedText("");
    setRandomCount(0);
    setRandomsAssigned(false);
  }

  function removeParticipant(id) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
    setRandomsAssigned(false);
    setRandomAssignments((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function resetRandoms() {
    setAssigned(new Map());
    setRandomAssignments({});
    setRandomsAssigned(false);
  }

  function assignRandomsNow() {
    if (!allFixedValid) {
      alert("Conflicts detected. Please resolve before assigning randoms.");
      return;
    }
    const { map, randomMap } = buildAssignment();
    setAssigned(map);
    setRandomAssignments(randomMap);
    setRandomsAssigned(true);
  }

  function exportCSV() {
    const rows = [];
    const source = randomsAssigned ? assigned : fixedClaims;
    for (let i = 1; i <= totalSpots; i++) {
      rows.push({ spot: i, name: source.get(i) || "" });
    }
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raffle_${totalSpots}_spots.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const availableCount = useMemo(() => {
    // Accurate count of unfilled spots in current view
    if (randomsAssigned) {
      let empty = 0;
      for (let i = 1; i <= totalSpots; i++) if (!assigned.get(i)) empty++;
      return empty;
    }
    // Before assigning randoms, use fixedClaims (first-come) not raw lengths
    return totalSpots - fixedClaims.size;
  }, [assigned, fixedClaims, totalSpots, randomsAssigned]);

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto grid gap-6 md:gap-8">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">🎟️ Raffle Assistant</h1>
            <p className="text-sm text-gray-600">Fixed picks are shown right away. Randoms only appear when you click <b>Assign randoms</b>. Use <b>Reset randoms</b> to clear them. Randoms are assigned randomly among the available spots.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Total spots</label>
            <input
              type="number"
              min={1}
              value={totalSpots}
              onChange={(e) => {
                const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                setTotalSpots(n);
                setRandomsAssigned(false);
              }}
              className="w-24 rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </header>

        {/* Add participant */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 grid gap-4">
          <h2 className="text-lg font-semibold">Add participant</h2>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Jane Doe"
                className="rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="grid gap-1 md:col-span-2">
              <label className="text-sm font-medium">Fixed spots (comma/range)</label>
              <input
                value={fixedText}
                onChange={(e) => setFixedText(e.target.value)}
                placeholder="e.g., 1,3,5-8"
                className="rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Random spots</label>
              <input
                type="number"
                min={0}
                value={randomCount}
                onChange={(e) => setRandomCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="rounded-xl border px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              onClick={addParticipant}
              className="md:col-span-4 rounded-2xl bg-black text-white px-4 py-2 font-medium shadow hover:opacity-90"
            >
              + Add participant
            </button>
          </div>
        </section>

        {/* Participants list */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 grid gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Participants ({participants.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={assignRandomsNow}
                className={`rounded-2xl px-4 py-2 font-medium shadow ${allFixedValid ? 'bg-black text-white' : 'bg-gray-300 text-gray-600 cursor-not-allowed'}`}
                disabled={!allFixedValid}
              >
                Assign randoms
              </button>
              <button
                onClick={exportCSV}
                className="rounded-2xl border px-4 py-2 font-medium shadow bg-white hover:bg-gray-50"
              >
                Export CSV
              </button>
              <button
                onClick={resetRandoms}
                className="rounded-2xl border px-4 py-2 font-medium shadow bg-white hover:bg-gray-50"
              >
                Reset randoms
              </button>
            </div>
          </div>

          {!allFixedValid && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <b>Conflicts detected:</b> Two or more people chose the same fixed spot. Please edit the entries below.
              <ul className="list-disc pl-5 mt-2">
                {conflicts.map((c, idx) => (
                  <li key={idx}>Spot {c.spot}: first by <b>{c.first}</b>, later also chosen by <b>{c.later}</b></li>
                ))}
              </ul>
            </div>
          )}

          {participants.length === 0 ? (
            <p className="text-sm text-gray-600">No participants yet. Add someone above.</p>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Fixed spots</th>
                    <th className="px-3 py-2 text-left">Randoms</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, i) => {
                    const randNums = randomsAssigned ? (randomAssignments[p.id] || []) : [];
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2">{p.fixedSpots.join(", ") || "—"}</td>
                        <td className="px-3 py-2">
                          {p.randomCount}
                          {randNums.length > 0 && ` (${randNums.join(", ")})`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeParticipant(p.id)}
                            className="rounded-xl border px-3 py-1 text-xs hover:bg-gray-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Live assignment preview */}
        <section className="bg-white rounded-2xl shadow p-4 md:p-6 grid gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Assignment preview</h2>
            <div className="text-sm text-gray-600">Unfilled: <b>{availableCount}</b></div>
          </div>
          <div className="overflow-auto rounded-xl border max-h-[420px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Spot #</th>
                  <th className="px-3 py-2 text-left">Name</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalSpots }, (_, i) => i + 1).map((i) => {
                  const src = randomsAssigned ? assigned : fixedClaims;
                  const name = src.get(i) || "";
                  const isFixed = fixedClaims.get(i) === name && !!name;
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{i}</td>
                      <td className={`px-3 py-1.5 ${isFixed ? 'text-blue-700' : ''}`}>{name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Blue names are fixed picks. Randoms only appear after clicking <b>Assign randoms</b>. Use <b>Reset randoms</b> to clear them.</p>
        </section>

        <footer className="text-xs text-gray-500 text-center pb-4">Built for quick Facebook raffle management — fixed first, randoms later, conflict-aware.</footer>
      </div>
    </div>
  );
}
