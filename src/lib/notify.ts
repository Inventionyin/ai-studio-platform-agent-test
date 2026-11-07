let handler: ((message: string) => void) | null = null;

export function setErrorNotifier(fn: ((message: string) => void) | null) {
  handler = fn;
}

export function notifyError(message: string) {
  handler?.(message);
}
