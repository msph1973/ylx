export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function formatPin(pin: string): string {
  return `${pin.slice(0, 2)}-${pin.slice(2)}`;
}
