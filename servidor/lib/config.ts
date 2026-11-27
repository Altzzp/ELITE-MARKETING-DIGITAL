import { esClaveDeServicio } from './claves.ts';

/** Configuración de Supabase para el servidor. Usa la clave pública (publishable/anon); una clave de servicio se rechaza. */
export function configSupabase(entorno: Record<string, string | undefined> = process.env): { url: string; clave: string } {
  const url = entorno['SUPABASE_URL']?.trim(), clave = entorno['SUPABASE_ANON_KEY']?.trim();
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY (ver servidor/.env.example)');
  if (esClaveDeServicio(clave)) throw new Error('SUPABASE_ANON_KEY contiene una clave de servicio: se rechaza');
  return { url, clave };
}
