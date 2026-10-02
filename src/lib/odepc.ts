export type ArtPosting = {
  id: string;
  title: string;
  location: string;
  deadline: string | null;
  deadlineLabel: string;
  open: boolean;
  url: string;
  salary: string | null;
  excerpt: string;
  source: "job" | "news";
};

export type WatchResult = {
  checkedAt: string;
  alert: boolean;
  open: ArtPosting[];
  closed: ArtPosting[];
  scannedJobs: number;
  source: "odepc.kerala.gov.in";
};

const ART_TEACHER =
  /\b(?:art\s+teachers?|fine\s+arts?\s+teachers?|drawing\s+teachers?|visual\s+arts?\s+teachers?|arts?\s*(?:&|and)\s*crafts?\s+teachers?|craft\s+teachers?|art\s+instructors?)\b/i;

export function isArtTeacher(text: string): boolean {
  return ART_TEACHER.test(text.replace(/\s+/g, " "));
}

export function todayISO(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function datePart(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!dmy) return null;
  return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

export function isOpenDeadline(deadline: string | null, today: string): boolean {
  if (!deadline) return true;
  return deadline >= today;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDeadline(iso: string | null): string {
  if (!iso) return "തീയതി വ്യക്തമല്ല";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/"/g, '"')
    .replace(/&#39;|'|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function clip(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
