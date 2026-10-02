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
  board: "ODEPC" | "NORKA";
};

export type WatchResult = {
  checkedAt: string;
  alert: boolean;
  open: ArtPosting[];
  closed: ArtPosting[];
  scannedJobs: number;
  source: "odepc.kerala.gov.in · norkaroots.kerala.gov.in";
};

const ART_TEACHER =
  /\b(?:art\s+teachers?|fine\s+arts?\s+teachers?|drawing\s+teachers?|visual\s+arts?\s+teachers?|arts?\s*(?:&|and)\s*crafts?\s+teachers?|craft\s+teachers?|art\s+instructors?)\b/i;

const ART_TEACHER_ML =
  /ആർട്ട്\s*ടീച്ച|ആർട്\s*ടീച്ച|ചിത്രകലാ?\s*അധ്യാപ|ഡ്രോയിംഗ്\s*ടീച്ച|ഫൈൻ\s*ആർട്സ്/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isArtTeacher(text: string): boolean {
  const clean = text.replace(/\s+/g, " ");
  return ART_TEACHER.test(clean) || ART_TEACHER_ML.test(clean);
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
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const named = raw.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (!named) return null;
  const month = MONTHS.findIndex((name) => named[2].toLowerCase().startsWith(name.toLowerCase()));
  if (month < 0) return null;
  return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

export function isOpenDeadline(deadline: string | null, today: string): boolean {
  if (!deadline) return true;
  return deadline >= today;
}

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

function ageDays(iso: string, today: string): number {
  const start = Date.parse(`${iso}T00:00:00+05:30`);
  const end = Date.parse(`${today}T00:00:00+05:30`);
  return Math.round((end - start) / 86_400_000);
}

export function norkaHits(html: string, today: string): { postings: ArtPosting[]; scanned: number } {
  const found: ArtPosting[] = [];
  const seen = new Set<string>();
  let scanned = 0;

  const add = (posting: ArtPosting) => {
    const key = posting.title.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    found.push(posting);
  };

  const cards =
    /<h2 class="title">\s*<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?short_desc">([\s\S]*?)<\/p>[\s\S]*?<span class="loc[^"]*"[^>]*><\/span>\s*([^<]+)<\/li>[\s\S]*?Last Date\s*:[\s\S]*?<span>([\s\S]*?)<\/span>/gi;
  for (const match of html.matchAll(cards)) {
    scanned += 1;
    const title = plainText(match[1]);
    const desc = plainText(match[2]);
    if (!isArtTeacher(`${title} ${desc}`)) continue;
    const last = plainText(match[4]);
    const continuous = /continuous|തുടര/i.test(last);
    const deadline = continuous ? null : datePart(last);
    add({
      id: `norka-job-${title.toLowerCase()}`,
      title,
      location: plainText(match[3]) || "നോർക്ക",
      deadline,
      deadlineLabel: continuous ? "തുടരുന്നു" : formatDeadline(deadline),
      open: isOpenDeadline(deadline, today),
      url: "https://norkaroots.kerala.gov.in/#jobs",
      salary: null,
      excerpt: clip(desc, 180),
      source: "job",
      board: "NORKA",
    });
  }

  const marquee = html.match(/<marquee[\s\S]*?<\/marquee>/i);
  if (marquee) {
    for (const bit of plainText(marquee[0]).split("*")) {
      const title = bit.trim();
      if (title.length < 8) continue;
      scanned += 1;
      if (!isArtTeacher(title)) continue;
      const deadline = datePart(title);
      add({
        id: `norka-now-${title.slice(0, 48).toLowerCase()}`,
        title,
        location: "നോർക്ക അറിയിപ്പ്",
        deadline,
        deadlineLabel: formatDeadline(deadline),
        open: deadline ? isOpenDeadline(deadline, today) : true,
        url: "https://norkaroots.kerala.gov.in/",
        salary: null,
        excerpt: "",
        source: "news",
        board: "NORKA",
      });
    }
  }

  const notices =
    /<a[^>]+href="(https:\/\/norkaroots\.kerala\.gov\.in\/mediadetailpage\/[^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,240})/gi;
  for (const match of html.matchAll(notices)) {
    const title = plainText(match[2]);
    if (title.length < 8) continue;
    scanned += 1;
    const around = plainText(match[3]);
    if (!isArtTeacher(`${title} ${around}`)) continue;
    const dated = datePart(title) ?? datePart(around);
    const fresh = dated ? ageDays(dated, today) <= 75 && isOpenDeadline(dated, today) : false;
    add({
      id: `norka-news-${title.slice(0, 48).toLowerCase()}`,
      title,
      location: "നോർക്ക വിജ്ഞാപനം",
      deadline: dated,
      deadlineLabel: formatDeadline(dated),
      open: fresh,
      url: match[1],
      salary: null,
      excerpt: "",
      source: "news",
      board: "NORKA",
    });
  }

  return { postings: found, scanned };
}
