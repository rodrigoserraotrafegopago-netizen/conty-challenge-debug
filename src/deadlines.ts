// O prazo é um dia civil em America/Sao_Paulo. O dia da aprovação precisa ser
// calculado nesse fuso: 22:02 de 12/03 em São Paulo já é 13/03 em UTC.
const civilDayInSaoPaulo = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sem fuso explícito (só a data, ou data e hora sem "Z"/offset), o valor já é horário de São Paulo.
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function approvedCivilDay(approvedAt: string): string {
  if (!HAS_EXPLICIT_OFFSET.test(approvedAt.trim())) return approvedAt.trim().slice(0, 10);
  const parts = civilDayInSaoPaulo.formatToParts(new Date(approvedAt));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isPastDeadline(approvedAt: string, deadlineDate: string): boolean {
  return approvedCivilDay(approvedAt) > deadlineDate;
}
