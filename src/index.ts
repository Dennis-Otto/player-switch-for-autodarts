/**
 * Player Switch for Autodarts: Chrome extension for a shared Autodarts display: everyone plays under their own account and a tap on a tile switches players. Sessions are parked and kept fresh, so nobody signs in again; an optional remembered password signs an account back in by itself. Everything stays on the computer.
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
