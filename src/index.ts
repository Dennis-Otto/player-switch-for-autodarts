/**
 * Player Switch for Autodarts: A Chrome extension that switches between Autodarts accounts on a shared touch display with one tap, without signing in again.
 *
 * The starting point of the package; replace it with the real code.
 */
export function greet(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new RangeError("name is empty");
  }
  return `Hello, ${trimmed}!`;
}
