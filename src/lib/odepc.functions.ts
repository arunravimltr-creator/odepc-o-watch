import { createServerFn } from "@tanstack/react-start";
import { createDecipheriv } from "node:crypto";
import {
  clip,
  datePart,
  decodeEntities,
  formatDeadline,
  isArtTeacher,
  isOpenDeadline,
  norkaHits,
  plainText,
  todayISO,
  type ArtPosting,
  type WatchResult,
} from "@/lib/odepc";

const ORIGIN = "https://odepc.kerala.gov.in";
const CACHE_MS = 12_000;

type JobRow = {
  id: number;
  title?: string;
  slug?: string;
  description?: string;
  salary?: string | null;
  work_location?: string | null;
  deadline_date?: string | null;
  diffInDays?: number | null;
  country?: string | null;
  city?: string | null;
};

type JobsPage = {
  jobs?: JobRow[];
  pagination?: { last_page?: number; total?: number };
};

let cache: { at: number; value: WatchResult } | null = null;

async function pull(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/json, text/html;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; OWatch/1.0; +https://odepc.kerala.gov.in/jobs-list)",
    },
    signal: AbortSignal.timeout(15_000),
  });
}

async function pullJson<T>(url: string): Promise<T> {
  const response = await pull(url);
  if (!response.ok) throw new Error(`ODEPC ${response.status}`);
  return (await response.json()) as T;
}

function jobUrl(job: JobRow): string {
  const slug = job.slug ?? "";
  const deadline = encodeURIComponent(job.deadline_date ?? "");
  return `${ORIGIN}/job/${slug}/${deadline}`;
}

function locationOf(job: JobRow): string {
  const place = [job.work_location, job.city, job.country]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return [...new Set(place)].join(", ") || "രാജ്യം വ്യക്തമല്ല";
}

function fromJob(job: JobRow, today: string): ArtPosting | null {
  const title = decodeEntities(job.title ?? "").replace(/\s+/g, " ").trim();
  const body = plainText(job.description ?? "");
  if (!isArtTeacher(`${title} ${body}`)) return null;
  const deadline = datePart(job.deadline_date);
  const salary = clip(plainText(job.salary ?? ""), 80);
  return {
    id: `job-${job.id}`,
    title,
    location: locationOf(job),
    deadline,
    deadlineLabel: formatDeadline(deadline),
    open: isOpenDeadline(deadline, today),
    url: jobUrl(job),
    salary: salary || null,
    excerpt: clip(body, 220),
    source: "job",
    board: "ODEPC",
  };
}

function newsHits(html: string, today: string): ArtPosting[] {
  const found: ArtPosting[] = [];
  const seen = new Set<string>();
  const pattern =
    /<a[^>]+href="(https:\/\/odepc\.kerala\.gov\.in\/home\/detailed-news\/\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = match[1];
    const title = plainText(match[2]);
    if (title.length < 12 || !isArtTeacher(title) || seen.has(url)) continue;
    seen.add(url);
    const deadline = datePart(title);
    found.push({
      id: `news-${url.split("/").pop()}`,
      title,
      location: "ODEPC വാർത്ത",
      deadline,
      deadlineLabel: formatDeadline(deadline),
      open: isOpenDeadline(deadline, today),
      url,
      salary: null,
      excerpt: "",
      source: "news",
      board: "ODEPC",
    });
  }
  return found;
}

async function scanOdepc(today: string): Promise<{ postings: ArtPosting[]; scanned: number }> {
  const first = await pullJson<JobsPage>(`${ORIGIN}/job/get-job?page=1`);
  const last = Math.max(1, Math.min(first.pagination?.last_page ?? 1, 8));
  const [restPages, news] = await Promise.all([
    Promise.all(
      Array.from({ length: Math.max(0, last - 1) }, (_, index) =>
        pullJson<JobsPage>(`${ORIGIN}/job/get-job?page=${index + 2}`).catch(() => ({ jobs: [] })),
      ),
    ),
    pull(`${ORIGIN}/home/news-list`)
      .then((response) => (response.ok ? response.text() : ""))
      .catch(() => ""),
  ]);

  const jobs = [first, ...restPages].flatMap((page) => page.jobs ?? []);
  const matched = new Map<string, ArtPosting>();
  for (const job of jobs) {
    const posting = fromJob(job, today);
    if (posting) matched.set(posting.title.toLowerCase(), posting);
  }
  for (const posting of newsHits(news, today)) {
    const key = posting.title.toLowerCase();
    if ([...matched.keys()].some((title) => key.includes(title) || title.includes(key.slice(0, 48)))) {
      continue;
    }
    matched.set(`news:${posting.id}`, posting);
  }
  return { postings: [...matched.values()], scanned: first.pagination?.total ?? jobs.length };
}

const NORKA = "https://norkaroots.kerala.gov.in";

function bpcCookie(html: string): string | null {
  const parts = [...html.matchAll(/toNumbers\("([0-9a-f]+)"\)/gi)].map((match) => match[1]);
  if (parts.length < 3) return null;
  const [keyHex, ivHex, cipherHex] = parts;
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("hex");
}

async function norkaHtml(): Promise<string> {
  const first = await pull(`${NORKA}/`);
  const challenge = await first.text();
  if (!challenge.includes("Checking your browser")) return challenge;
  const cookie = bpcCookie(challenge);
  if (!cookie) return "";
  const page = await fetch(`${NORKA}/?prophazecheck=1`, {
    headers: {
      Accept: "text/html",
      Cookie: `BPC=${cookie}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!page.ok) return "";
  return page.text();
}

async function scanNorka(today: string): Promise<{ postings: ArtPosting[]; scanned: number }> {
  const html = await norkaHtml();
  if (!html || html.includes("Checking your browser")) return { postings: [], scanned: 0 };
  return norkaHits(html, today);
}

async function scan(): Promise<WatchResult> {
  const today = todayISO();
  const [odepcSettled, norkaSettled] = await Promise.allSettled([scanOdepc(today), scanNorka(today)]);
  if (odepcSettled.status === "rejected" && norkaSettled.status === "rejected") {
    throw odepcSettled.reason;
  }
  const odepc = odepcSettled.status === "fulfilled" ? odepcSettled.value : { postings: [], scanned: 0 };
  const norka = norkaSettled.status === "fulfilled" ? norkaSettled.value : { postings: [], scanned: 0 };
  const matched = new Map<string, ArtPosting>();
  for (const posting of [...odepc.postings, ...norka.postings]) {
    matched.set(`${posting.board}:${posting.title.toLowerCase()}`, posting);
  }
  const all = [...matched.values()].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return (b.deadline ?? "").localeCompare(a.deadline ?? "");
  });
  const open = all.filter((posting) => posting.open);
  return {
    checkedAt: new Date().toISOString(),
    alert: open.length > 0,
    open,
    closed: all.filter((posting) => !posting.open),
    scannedJobs: odepc.scanned + norka.scanned,
    source: "odepc.kerala.gov.in · norkaroots.kerala.gov.in",
  };
}

export const checkOdepc = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const value = await scan();
  cache = { at: now, value };
  return value;
});
