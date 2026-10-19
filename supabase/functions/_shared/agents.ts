// Omitted agent means the existing Tiny Axe client. Unknown values fail closed.
export const AGENTS = ["tiny-axe", "busterclaw"] as const;
export type Agent = typeof AGENTS[number];
export function remoteAgent(value: unknown): Agent | null {
  if (value === undefined) return "tiny-axe";
  return AGENTS.find(agent => agent === value) ?? null;
}
export function remoteTopic(owner: string, agent: Agent): string {
  return agent === "tiny-axe" ? `remote:${owner}` : `remote:${owner}:busterclaw`;
}
