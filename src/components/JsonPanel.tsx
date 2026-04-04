type JsonPanelProps = {
  label: string;
  title: string;
  value: unknown;
  caption?: string;
};

export function JsonPanel({ label, title, value, caption }: JsonPanelProps) {
  return (
    <article className="panel json-panel">
      <div className="panel-head">
        <div>
          <p className="section-label">{label}</p>
          <h3>{title}</h3>
        </div>
      </div>
      {caption ? <p className="panel-copy">{caption}</p> : null}
      <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>
    </article>
  );
}
