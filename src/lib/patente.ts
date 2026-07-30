/** Formatos argentinos: ABC123 | AB123CD */
export function normalizePatente(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-/]/g, "");
}

export function isValidPatente(patente: string): boolean {
  return /^[A-Z]{3}[0-9]{3}$/.test(patente) || /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(patente);
}
