import { useState, useRef } from "react";
import Topography from "./components/ui/topography";

function App() {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  const mirrorRef = useRef(null);
  const [cursorLeft, setCursorLeft] = useState(0);
  const [language, setLanguage] = useState("");
  const [minStars, setMinStars] = useState("");
  const [gameOpen, setGameOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [started, setStarted] = useState(false);

  // Measure where the text cursor is inside the input
  const updateCursorPos = (value, selectionStart) => {
    const mirror = mirrorRef.current;
    const input = inputRef.current;
    if (!mirror || !input) return;
    // Copy computed styles so mirror matches input exactly
    const style = window.getComputedStyle(input);
    mirror.style.font = style.font;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.padding = "0";
    mirror.textContent = value.slice(0, selectionStart);
    setCursorLeft(mirror.scrollWidth);
  };

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    setLoading(true);
    setSearched(true);
    // Update history: add to front, dedupe, cap at 8
    const trimmed = searchText.trim();
    setHistory(prev => [trimmed, ...prev.filter(q => q !== trimmed)].slice(0, 8));
    try {
      const params = new URLSearchParams({ q: searchText });
      if (language) params.append("language", language);
      if (minStars) params.append("minStars", minStars);

      const response = await fetch(`http://localhost:5050/search?${params.toString()}`);
      const data = await response.json();
      setResults(data);
    } catch (err) {
      console.error(err);
      setResults([]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <>
      {!started && (
        <div
          className="min-h-screen flex flex-col items-center justify-center"
          style={{ background: "var(--bg)" }}
        >
          <div className="fixed inset-0 z-0">
            <Topography
              lowColor="#1A1611"
              midColor="#E8A33D"
              highColor="#5EEAD4"
              opacity={0.15}
              thickness={0.015}
              bands={3}
              glow={0.6}
              mouseInteraction={true}
              mouseRadius={0.25}
              mouseStrength={0.5}
              grain={true}
              grainIntensity={0.03}
            />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-6">
            <p
              className="font-mono-display text-sm tracking-widest"
              style={{ color: "var(--amber)" }}
            >
              REPO_SEARCH.exe
            </p>
            <button
              onClick={() => setStarted(true)}
              className="font-mono-display px-6 py-3 rounded font-semibold transition-transform duration-300 hover:scale-105"
              style={{ background: "var(--amber)", color: "var(--bg)" }}
            >
              $ get started_
            </button>
          </div>
        </div>
      )}

      {started && (
        <div className="animate-[fadeIn_0.6s_ease-in-out] min-h-screen" style={{ background: "var(--bg)" }} >
      <div className="fixed inset-0 z-0">
        <Topography
          lowColor="#1A1611"
          midColor="#E8A33D"
          highColor="#5EEAD4"
          opacity={0.15}
          thickness={0.015}
          bands={3}
          glow={0.6}
          mouseInteraction={true}
          mouseRadius={0.25}
          mouseStrength={0.5}
          grain={true}
          grainIntensity={0.03}
        />
      </div>
      <div className="relative z-10 max-w-3xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-10">
          <p className="font-mono-display text-sm tracking-widest" style={{ color: "var(--amber)" }}>
            REPO_SEARCH.exe
          </p>
          <h1 className="font-mono-display text-3xl font-semibold mt-2" style={{ color: "var(--text)" }}>
            grep for repositories, by meaning
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            500 indexed repos · keyword + semantic hybrid search
          </p>
        </div>

        {/* Terminal-style search bar */}
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-md font-mono-display text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--amber)" }}>$</span>
          <span style={{ color: "var(--muted)" }}>search›</span>

          {/* Input wrapper — positions the custom cursor relative to typed text */}
          <div className="flex-1 relative overflow-hidden">
            {/* Hidden mirror element to measure text width */}
            <span
              ref={mirrorRef}
              aria-hidden="true"
              style={{
                position: "absolute",
                visibility: "hidden",
                whiteSpace: "pre",
                pointerEvents: "none",
              }}
            />
            <input
              ref={inputRef}
              autoFocus
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                updateCursorPos(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyUp={(e) => {
                updateCursorPos(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onClick={(e) => {
                updateCursorPos(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onKeyDown={(e) => {
                handleKeyDown(e);
              }}
              placeholder="chatbot framework, rate limiting, ..."
              className="w-full bg-transparent outline-none"
              style={{ color: "var(--text)", caretColor: "transparent" }}
            />
            {/* Custom blinking cursor positioned where the caret actually is */}
            <span
              className="cursor-blink pointer-events-none absolute top-0"
              style={{
                left: `${cursorLeft}px`,
                color: "var(--amber)",
                lineHeight: "inherit",
              }}
            >
              ▍
            </span>
          </div>

          <button
            onClick={handleSearch}
            className="px-3 py-1 rounded font-mono-display text-xs font-semibold shrink-0"
            style={{ background: "var(--amber)", color: "var(--bg)" }}
          >
            RUN
          </button>
        </div>

        <div className="flex gap-3 mt-3 font-mono-display text-xs">
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="language (e.g. python)"
            className="px-3 py-1.5 rounded bg-transparent outline-none"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <input
            value={minStars}
            onChange={(e) => setMinStars(e.target.value)}
            type="number"
            placeholder="min stars"
            className="px-3 py-1.5 rounded bg-transparent outline-none w-32"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>

        {/* System status sidebar - right */}
        <div
          className="hidden lg:flex flex-col gap-4 fixed right-10 top-1/2 -translate-y-1/2 z-10 font-mono-display text-xs"
          style={{ color: "var(--muted)" }}
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cyan)" }} />
            <span>STATUS: online</span>
          </div>
          <div>INDEX: 500 repos</div>
          <div>MODE: hybrid</div>
          <div>ENGINE: elasticsearch</div>
          <div>MODEL: MiniLM-L6-v2</div>
        </div>

        {/* LEFT — vertical icon bar */}
        <div className="hidden lg:flex flex-col gap-3 fixed left-10 top-16 z-10">
          <button
            className="w-9 h-9 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            title="Account"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            onClick={() => setGameOpen(o => !o)}
            className="w-9 h-9 flex items-center justify-center rounded transition-colors"
            style={{ color: gameOpen ? "var(--amber)" : "var(--muted)", background: gameOpen ? "var(--surface)" : "transparent" }}
            onMouseEnter={e => { if (!gameOpen) e.currentTarget.style.background = "var(--surface)"; }}
            onMouseLeave={e => { if (!gameOpen) e.currentTarget.style.background = "transparent"; }}
            title="Mini-game"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <path d="M6 12h4M8 10v4M15 11h.01M17 13h.01"/>
            </svg>
          </button>
        </div>

        {/* RIGHT — query history panel */}
        <div className="hidden lg:flex flex-col gap-2 fixed right-10 top-16 z-10 w-44 font-mono-display text-xs">
          <p className="text-xs font-semibold tracking-widest mb-1" style={{ color: "var(--amber)" }}>HISTORY</p>
          {history.length === 0 ? (
            <p style={{ color: "var(--muted)", opacity: 0.4 }}>no queries yet</p>
          ) : (
            history.map((q, i) => (
              <button
                key={i}
                onClick={() => setSearchText(q)}
                className="text-left truncate px-2 py-1 rounded transition-colors"
                style={{ color: "var(--muted)", background: "transparent" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}
                title={q}
              >
                › {q}
              </button>
            ))
          )}
        </div>

        {/* BOTTOM RIGHT — game placeholder */}
        {gameOpen && (
          <div
            className="lg:flex fixed bottom-10 right-10 z-20 items-center justify-center font-mono-display text-xs rounded-md"
            style={{ width: 260, height: 180, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            <span style={{ opacity: 0.4 }}>game coming soon...</span>
          </div>
        )}

        {/* Results */}
        <div className="mt-8">
          {loading && (
            <p className="font-mono-display text-sm" style={{ color: "var(--muted)" }}>
              searching index<span className="cursor-blink">...</span>
            </p>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="font-mono-display text-sm" style={{ color: "var(--muted)" }}>
              no matches. try a broader query.
            </p>
          )}

          {!loading && results.length > 0 && (
            <div style={{ border: "1px solid var(--border)" }} className="rounded-md overflow-hidden">
              {results.map((repo, i) => {
                const score = repo._score || 0;
                const barWidth = Math.min(100, score * 8);
                return (
                  <a
                    key={repo._id}
                    href={repo._source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-4 px-4 py-4 hover:bg-white/[0.03] transition-colors"
                    style={{
                      borderBottom: i !== results.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span
                      className="font-mono-display text-xs pt-1 shrink-0 w-6 text-right"
                      style={{ color: "var(--muted)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-mono-display font-semibold text-sm" style={{ color: "var(--text)" }}>
                          {repo._source.name}
                        </p>
                        <span className="font-mono-display text-xs shrink-0" style={{ color: "var(--muted)" }}>
                          ★ {repo._source.stars}
                        </span>
                      </div>
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                        {repo._source.description || "No description"}
                      </p>
                      <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--border)", width: "120px" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${barWidth}%`, background: "var(--cyan)" }}
                        />
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
      )}
    </>
  );
}

export default App;