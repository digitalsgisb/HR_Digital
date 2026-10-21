export const malaysiaDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
export const malaysiaTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
export const monthTitle = (month: string) => new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
export function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}
export function calendarDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(first); value.setUTCDate(index - offset + 1);
    const date = value.toISOString().slice(0, 10);
    return { date, day: value.getUTCDate(), muted: !date.startsWith(month) };
  });
}
