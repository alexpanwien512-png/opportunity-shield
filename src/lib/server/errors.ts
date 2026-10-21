// Turns internal failures into sentences a person can act on. The raw message stays in the server log.
export function humanError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid url")) return "That doesn't look like a link. Paste the full address, starting with https://";
  if (m.includes("unsupported github url")) return "That GitHub link isn't an issue. Paste a link to a specific issue, like …/issues/123.";
  if (m.includes("could not read")) return "Couldn't reach that page. Check the link, or try again in a minute.";
  if (/-> 404\b/.test(m)) return "That page doesn't exist (404). Check the link.";
  if (/-> 403\b|rate limit/.test(m)) return "The site is limiting requests right now. Try again in a few minutes.";
  if (m.includes("demo limit")) return message;
  return "Something went wrong while analyzing that page. Try again in a minute.";
}
