// Implementación de Repositorio sobre supabase-js. El cliente se crea con el JWT de la persona (nunca con service_role),
// de modo que las políticas RLS de 0002 siguen decidiendo qué conversaciones y marcas se pueden leer.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversacionFila, Intercambio, MarcaConZona, Repositorio } from './generar.ts';
import { PROVEEDORES, type Turno } from './tipos.ts';
import { arr, obj, txt } from './util.ts';

const fallo = (donde: string, e: { message: string }): never => { throw new Error(`${donde}: ${e.message}`); };

export function repositorioSupabase(bd: SupabaseClient): Repositorio {
  return {
    async conversacion(id) {
      const { data, error } = await bd.from('conversaciones_ia').select('id, marca_id, titulo, proveedor').eq('id', id).maybeSingle();
      if (error) fallo('conversacion', error);
      const f = obj(data);
      return f.id && (PROVEEDORES as readonly string[]).includes(txt(f.proveedor)) ? (f as unknown as ConversacionFila) : null;
    },

    async marca(id) {
      const { data, error } = await bd.from('marcas')
        .select('nombre, sector, publico_objetivo, tono, paleta, tipografias, redes, brief, agencias(zona_horaria)').eq('id', id).maybeSingle();
      if (error) fallo('marca', error);
      if (!data) return null;
      const { agencias, ...resto } = data as Record<string, unknown>;
      const ag = obj(Array.isArray(agencias) ? agencias[0] : agencias);
      return { ...(resto as unknown as MarcaConZona), zona_horaria: txt(ag.zona_horaria) || null };
    },

    async historial(conversacionId, limite) {
      const { data, error } = await bd.from('mensajes_ia').select('rol, texto').eq('conversacion_id', conversacionId).order('orden', { ascending: false }).limit(limite);
      if (error) fallo('historial', error);
      return arr(data).map(obj).reverse()
        .filter((m) => m.rol === 'usuario' || m.rol === 'asistente')
        .map((m): Turno => ({ rol: m.rol as Turno['rol'], texto: txt(m.texto) }));
    },

    async usoUltimas24h() {
      const { data, error } = await bd.rpc('uso_ia_24h');
      if (error) fallo('uso', error);
      const n = Number(data);
      if (!Number.isFinite(n)) throw new Error('uso: valor no numérico');   // ante la duda, el límite no se salta
      return n;
    },

    async registrarUso(u) {
      const { error } = await bd.from('uso_ia').insert({ proveedor: u.proveedor, modelo: u.modelo.slice(0, 100), tokens_entrada: u.tokensEntrada, tokens_salida: u.tokensSalida });
      if (error) fallo('registrarUso', error);
    },

    async guardarIntercambio(x: Intercambio) {
      // Una sola instrucción: o se guardan la pregunta y la respuesta, o ninguna. "orden" (0004) fija cuál va primero.
      const { data, error } = await bd.from('mensajes_ia').insert([
        { conversacion_id: x.conversacionId, rol: 'usuario', modo: x.modo, texto: x.textoUsuario },
        { conversacion_id: x.conversacionId, rol: 'asistente', modo: x.modo, texto: x.parseado.texto, elementos: x.parseado.elementos,
          proveedor: x.proveedor, modelo: x.salida.modelo.slice(0, 100), tokens_entrada: x.salida.tokensEntrada, tokens_salida: x.salida.tokensSalida },
      ]).select('id, rol, creado_en');
      if (error) fallo('guardarIntercambio', error);
      const r = arr(data).map(obj).find((m) => m.rol === 'asistente');
      if (!r) throw new Error('guardarIntercambio: sin fila de respuesta');
      const { error: e2 } = await bd.from('conversaciones_ia')
        .update({ proveedor: x.proveedor, modo: x.modo, actualizada_en: new Date().toISOString(), ...(x.titulo && { titulo: x.titulo }) }).eq('id', x.conversacionId);
      if (e2) console.error('[ia] no se pudo actualizar la conversación:', e2.message);   // no es grave: los mensajes ya están guardados
      return { id: txt(r.id), creadoEn: txt(r.creado_en) };
    },
  };
}
