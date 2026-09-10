export function normalizeCuit(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatCuit(cuit: string): string {
  const digits = normalizeCuit(cuit);
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function isValidCuit(cuit: string): boolean {
  const digits = normalizeCuit(cuit);
  if (!/^\d{11}$/.test(digits)) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = multipliers.reduce(
    (acc, multiplier, index) => acc + multiplier * Number(digits[index]),
    0,
  );
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(digits[10]);
}
