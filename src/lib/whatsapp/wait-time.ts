export function formatWait(minutes: number) {
  if (minutes < 1) return "Menos de 1 min";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes % 60} min`;
  return `${minutes} min`;
}
