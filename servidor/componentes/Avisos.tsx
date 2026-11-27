export function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'info'; children: React.ReactNode }) {
  return <p role={tipo === 'error' ? 'alert' : 'status'} className={`aviso aviso-${tipo}`}>{children}</p>;
}
