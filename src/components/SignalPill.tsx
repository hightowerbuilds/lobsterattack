type SignalPillProps = {
  tone: "teal" | "amber" | "ink" | "red";
  children: string;
};

export function SignalPill({ tone, children }: SignalPillProps) {
  return <span className={`signal-pill signal-pill-${tone}`}>{children}</span>;
}
