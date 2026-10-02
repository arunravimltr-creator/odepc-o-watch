import { createServerFn } from "@tanstack/react-start";
import {
  clip,
  datePart,
  decodeEntities,
  formatDeadline,
  isArtTeacher,
  isOpenDeadline,
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
    });
  }
  return found;
}

async function scan(): Promise<WatchResult> {
  const today = todayISO();
  const first = await pullJson<JobsPage>(`${ORIGIN}/job/get-job?page=1`);
  const last = Math.max(1, Math.min(first.pagination?.last_page ?? 1, 12));
  const [restPages, home, news] = await Promise.all([
    Promise.all(
      Array.from({ length: last - 1 }, (_, index) =>
        pullJson<JobsPage>(`${ORIGIN}/job/get-job?page=${index + 2}`),
      ),
    ),
    pull(`${ORIGIN}/`).then((response) => (response.ok ? response.text() : "")),
    pull(`${ORIGIN}/home/news-list`).then((response) => (response.ok ? response.text() : "")),
  ]);

  const jobs = [first, ...restPages].flatMap((page) => page.jobs ?? []);
  const matched = new Map<string, ArtPosting>();
  for (const job of jobs) {
    const posting = fromJob(job, today);
    if (posting) matched.set(posting.title.toLowerCase(), posting);
  }
  for (const posting of [...newsHits(home, today), ...newsHits(news, today)]) {
    const key = posting.title.toLowerCase();
    if ([...matched.keys()].some((title) => key.includes(title) || title.includes(key.slice(0, 48)))) {
      continue;
    }
    matched.set(`news:${posting.id}`, posting);
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
    scannedJobs: first.pagination?.total ?? jobs.length,
    source: "odepc.kerala.gov.in",
  };
}

export const checkOdepc = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const value = await scan();
  cache = { at: now, value };
  return value;
});
