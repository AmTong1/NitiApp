const THAI_TIME_ZONE = 'Asia/Bangkok';
const THAI_OFFSET_HOURS = 7;
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const hasExplicitTimeZone = (raw: string) => /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(raw);

const parseNaiveAsBangkok = (raw: string): Date | null => {
  const normalized = raw.replace(' ', 'T');

  const mDateTime = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
  );
  if (mDateTime) {
    const year = Number(mDateTime[1]);
    const month = Number(mDateTime[2]);
    const day = Number(mDateTime[3]);
    const hour = Number(mDateTime[4] || 0);
    const minute = Number(mDateTime[5] || 0);
    const second = Number(mDateTime[6] || 0);
    const ms = Number((mDateTime[7] || '0').padEnd(3, '0'));

    const utcMillis = Date.UTC(year, month - 1, day, hour - THAI_OFFSET_HOURS, minute, second, ms);
    const d = new Date(utcMillis);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const mDmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mDmy) {
    let year = Number(mDmy[3]);
    if (year > 2400) year -= 543;
    const month = Number(mDmy[2]);
    const day = Number(mDmy[1]);
    const utcMillis = Date.UTC(year, month - 1, day, -THAI_OFFSET_HOURS, 0, 0, 0);
    const d = new Date(utcMillis);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
};

export const parseServerDateTime = (input?: string | null): Date | null => {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  if (hasExplicitTimeZone(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const bangkokDate = parseNaiveAsBangkok(raw);
  if (bangkokDate) return bangkokDate;

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const formatThaiDateTime = (
  input?: string | null,
  opts: { withTime?: boolean } = {}
): string => {
  const date = parseServerDateTime(input);
  if (!date) return '-';

  const withTime = opts.withTime !== false;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: THAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const yearRaw = Number(parts.find(p => p.type === 'year')?.value || 0);
  const monthRaw = Number(parts.find(p => p.type === 'month')?.value || 0);
  const dayRaw = Number(parts.find(p => p.type === 'day')?.value || 0);
  const hourRaw = String(parts.find(p => p.type === 'hour')?.value || '00').padStart(2, '0');
  const minuteRaw = String(parts.find(p => p.type === 'minute')?.value || '00').padStart(2, '0');

  const buddhistYear = yearRaw + 543;
  const monthLabel = THAI_MONTHS_SHORT[Math.max(0, monthRaw - 1)] || '-';
  const datePart = `${dayRaw} ${monthLabel} ${buddhistYear}`;

  if (!withTime) return datePart;

  return `${datePart} ${hourRaw}:${minuteRaw} น.`;
};

export const toSortableMs = (input?: string | null): number => {
  const date = parseServerDateTime(input);
  return date ? date.getTime() : 0;
};

export const toThaiYearMonthKey = (input?: string | null): string | null => {
  const date = parseServerDateTime(input);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: THAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  if (!year || !month) return null;

  return `${year}-${month}`;
};
