export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
