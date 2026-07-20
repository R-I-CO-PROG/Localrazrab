export function getInsufficientCreditsMessage(data: {
  required?: number;
  available?: number;
}): string {
  if (data.required != null && data.available != null) {
    return `Недостаточно кредитов: нужно ${data.required}, на счёте ${data.available}`;
  }
  return "Недостаточно кредитов для этой операции";
}
