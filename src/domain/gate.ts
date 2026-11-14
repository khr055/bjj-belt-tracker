// The question on the first screen keeps out people who stumble on the site. It is not a lock:
// the answer is in the app that every visitor downloads, so anyone who goes looking can find it.
const EXPECTED_NAME = 'professor moana';

/** Whether the answer to "What is your name?" lets the visitor in. Case and spacing don't matter. */
export function isExpectedName(answer: string): boolean {
  return answer.trim().replace(/\s+/g, ' ').toLowerCase() === EXPECTED_NAME;
}
