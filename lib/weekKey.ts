const MEETING_DAY = 1;   // Monday
const MEETING_HOUR = 18; // 6 PM

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getThisWeekSessionDate(now = new Date()) {
  const d = new Date(now);

  // الاثنين يفضل نفس اليوم طول اليوم
  const diff = (MEETING_DAY - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  d.setHours(MEETING_HOUR, 0, 0, 0);

  return d;
}

export function getThisWeekKey(now = new Date()) {
  return toISODate(getThisWeekSessionDate(now));
}
