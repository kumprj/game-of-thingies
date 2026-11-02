/** Pulls the server's error message out of a failed request, falling back to a default. */
export function errorMessage(err: unknown, fallback: string): string {
  return (err as any)?.response?.data?.error || fallback;
}
