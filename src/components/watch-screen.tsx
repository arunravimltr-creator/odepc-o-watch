import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { checkOdepc } from "@/lib/odepc.functions";
import type { ArtPosting, WatchResult } from "@/lib/odepc";
import { InstallApp } from "@/components/install-app";

const POLL_MS = 20_000;
const WATCH_COLOR = "#0f7a43";
const ALERT_COLOR = "#c4232b";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; stale: WatchResult | null }
  | { kind: "ready"; data: WatchResult };

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function chime() {
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 784;
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.07, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.46);
  oscillator.onended = () => void audio.close();
}

function paintChrome(alert: boolean) {
  const color = alert ? ALERT_COLOR : WATCH_COLOR;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  document.title = alert ? "O Watch · ആർട്ട് ടീച്ചർ ഒഴിവ്" : "O Watch · നിരീക്ഷണം";
}

export function WatchScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [secondsLeft, setSecondsLeft] = useState(POLL_MS / 1000);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    const id = ++runId.current;
    checkOdepc()
      .then((data) => {
        if (id !== runId.current) return;
        setPhase({ kind: "ready", data });
        setSecondsLeft(POLL_MS / 1000);
      })
      .catch((error: unknown) => {
        if (id !== runId.current) return;
        const message = error instanceof Error ? error.message : "പരിശോധന പരാജയപ്പെട്ടു";
        setPhase((current) => ({
          kind: "error",
          message,
          stale: current.kind === "ready" ? current.data : current.kind === "error" ? current.stale : null,
        }));
      });
  }, [nonce]);

  useEffect(() => {
    const poll = window.setInterval(() => setNonce((value) => value + 1), POLL_MS);
    const clock = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? POLL_MS / 1000 : value - 1));
    }, 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, []);

  const data = phase.kind === "ready" ? phase.data : phase.kind === "error" ? phase.stale : null;
  const alert = Boolean(data?.alert);
  const tone = alert ? "alert" : "watch";

  useEffect(() => {
    paintChrome(alert);
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (alert) void nav.setAppBadge?.(1);
    else void nav.clearAppBadge?.();
  }, [alert]);

  useEffect(() => {
    if (!data?.alert) return;
    const signature = data.open.map((posting) => posting.id).join("|");
    const previous = localStorage.getItem("owatch-notified");
    if (previous === signature) return;
    localStorage.setItem("owatch-notified", signature);
    const body = data.open.map((posting) => `${posting.title} — ${posting.location}`).join("\n");
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("ODEPC — ആർട്ട് ടീച്ചർ ഒഴിവ്", { body, tag: "odepc-art-teacher" });
    }
    try {
      chime();
    } catch {
      /* autoplay can be blocked until a tap */
    }
  }, [data]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === "granted" && data?.alert) {
      localStorage.removeItem("owatch-notified");
      setNonce((value) => value + 1);
    }
  }

  function refresh() {
    setNonce((value) => value + 1);
  }

  return (
    <main data-tone={tone} className="tone">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-8">
        <header className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold tracking-wide">ODEPC മാത്രം</p>
          <p className="text-sm text-muted">
            {data ? formatClock(data.checkedAt) : "ഇപ്പോൾ"}
          </p>
        </header>

        <InstallApp />

        <section className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          <div className="mark" aria-hidden="true">
            <span className={`ring ${alert ? "ring-pulse" : ""}`} />
            <span className="mark-letter">O</span>
          </div>
          <StatusCopy phase={phase} alert={alert} />
        </section>

        {data && data.open.length > 0 ? (
          <section className="mb-4 space-y-3">
            <h2 className="text-sm font-semibold">തുറന്നിരിക്കുന്നവ</h2>
            {data.open.map((posting) => (
              <PostingCard key={posting.id} posting={posting} />
            ))}
          </section>
        ) : null}

        {data && data.closed.length > 0 ? (
          <details className="panel mb-4 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              കഴിഞ്ഞ ആർട്ട് ടീച്ചർ വിജ്ഞാപനങ്ങൾ ({data.closed.length})
            </summary>
            <ul className="mt-3 space-y-3">
              {data.closed.map((posting) => (
                <li key={posting.id} className="border-t border-line pt-3 text-left">
                  <PostingBody posting={posting} compact />
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <footer className="mt-auto flex flex-col gap-3 pt-2">
          <div className="flex gap-2">
            {permission !== "granted" && permission !== "unsupported" ? (
              <button
                type="button"
                onClick={() => void enableNotifications()}
                className="chip inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
              >
                <Bell className="size-4" aria-hidden="true" />
                അറിയിപ്പ് ഓണാക്കുക
              </button>
            ) : (
              <p className="chip inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold">
                <BellRing className="size-4" aria-hidden="true" />
                {permission === "granted" ? "അറിയിപ്പ് ഓണാണ്" : "ഈ ബ്രൗസറിൽ അറിയിപ്പ് ഇല്ല"}
              </p>
            )}
            <button
              type="button"
              onClick={refresh}
              className="chip inline-flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {secondsLeft}s
            </button>
          </div>
          <p className="text-center text-xs text-muted">
            odepc.kerala.gov.in · ഓരോ 20 സെക്കൻഡിലും
            {data ? ` · ${data.scannedJobs} ജോലികൾ` : ""}
          </p>
        </footer>
      </div>
    </main>
  );
}

function StatusCopy({ phase, alert }: { phase: Phase; alert: boolean }) {
  if (phase.kind === "loading") {
    return (
      <>
        <h1 className="mt-6 text-3xl font-bold leading-tight">ODEPC നോക്കുന്നു</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
          ഏത് രാജ്യത്തും ആർട്ട് ടീച്ചർ വിവരം വന്നാൽ ഈ ആപ്പ് മുഴുവൻ ചുവക്കും.
        </p>
      </>
    );
  }

  if (phase.kind === "error" && !phase.stale) {
    return (
      <>
        <h1 className="mt-6 text-3xl font-bold leading-tight">ബന്ധം കിട്ടിയില്ല</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
          ODEPC സൈറ്റ് ഇപ്പോൾ മറുപടി തന്നില്ല. ഒഴിവ് ഇല്ല എന്ന് കരുതരുത്. വീണ്ടും നോക്കുന്നു.
        </p>
      </>
    );
  }

  if (alert) {
    const count = phase.kind === "ready" ? phase.data.open.length : phase.stale?.open.length ?? 0;
    return (
      <>
        <h1 className="mt-6 text-4xl font-bold leading-tight">ആർട്ട് ടീച്ചർ ഒഴിവ്</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
          {count} വിജ്ഞാപനം ഇപ്പോൾ തുറന്നിരിക്കുന്നു. വിശദാംശം താഴെ.
        </p>
      </>
    );
  }

  const closed = phase.kind === "ready" ? phase.data.closed.length : phase.stale?.closed.length ?? 0;
  return (
    <>
      <h1 className="mt-6 text-4xl font-bold leading-tight">ഒഴിവ് ഇല്ല</h1>
      <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
        ഇപ്പോൾ തുറന്ന ആർട്ട് ടീച്ചർ തസ്തിക ഇല്ല. പുതിയ വിവരം വരുന്ന നിമിഷം ഈ നിറം ചുവപ്പാകും.
        {closed > 0 ? ` കഴിഞ്ഞ ${closed} വിജ്ഞാപനം കാലാവധി കഴിഞ്ഞു.` : ""}
      </p>
      {phase.kind === "error" ? (
        <p className="mt-3 text-sm text-muted">അവസാന പരിശോധന പുതുക്കാൻ കഴിഞ്ഞില്ല. പഴയ ഫലം കാണിക്കുന്നു.</p>
      ) : null}
    </>
  );
}

function PostingCard({ posting }: { posting: ArtPosting }) {
  return (
    <article className="panel p-4 text-left">
      <PostingBody posting={posting} />
    </article>
  );
}

function PostingBody({ posting, compact = false }: { posting: ArtPosting; compact?: boolean }) {
  return (
    <div className="space-y-2">
      <h3 className={compact ? "text-sm font-semibold leading-snug" : "text-base font-semibold leading-snug"}>
        {posting.title}
      </h3>
      <p className="text-sm text-muted">
        {posting.location}
        {" · "}
        അവസാന തീയതി {posting.deadlineLabel}
        {posting.salary ? ` · ${posting.salary}` : ""}
      </p>
      {!compact && posting.excerpt ? <p className="text-sm leading-relaxed text-muted">{posting.excerpt}</p> : null}
      <a
        href={posting.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 items-center gap-2 text-sm font-semibold underline decoration-line underline-offset-4"
      >
        ODEPC-യിൽ തുറക്കുക
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
    </div>
  );
}
