// Módulos de la plataforma (los mismos del tipo modulo_app en la base de datos). Sin importaciones: se prueba con node --test.

export const MODULOS = [
  { id: 'panel', nombre: 'Panel', descripcion: 'Resumen del trabajo de la semana' },
  { id: 'calendario', nombre: 'Calendario', descripcion: 'Publicaciones y entregas por fecha' },
  { id: 'ideas', nombre: 'Ideas', descripcion: 'Banco de ideas por marca' },
  { id: 'chat', nombre: 'Chat de IA', descripcion: 'Ideas, copies y calendarios con Claude, ChatGPT o Gemini' },
  { id: 'plantillas', nombre: 'Apps y plantillas', descripcion: 'Herramientas y plantillas de diseño' },
  { id: 'tablero', nombre: 'Tablero', descripcion: 'Piezas en curso, de diseño a publicado' },
  { id: 'marcas', nombre: 'Información de marcas', descripcion: 'Ficha completa de cada marca' },
  { id: 'aprobaciones', nombre: 'Aprobaciones', descripcion: 'Revisión y decisiones del cliente' },
  { id: 'reportes', nombre: 'Reportes', descripcion: 'Cumplimiento, tiempos y publicaciones' },
  { id: 'usuarios', nombre: 'Usuarios y roles', descripcion: 'Invitaciones, roles y permisos' },
  { id: 'vista', nombre: 'Vista por rol', descripcion: 'Qué ve cada rol' },
  { id: 'apariencia', nombre: 'Apariencia', descripcion: 'Modo claro u oscuro' },
] as const;

export type ModuloId = (typeof MODULOS)[number]['id'];

export const esModulo = (x: unknown): x is ModuloId => typeof x === 'string' && MODULOS.some((m) => m.id === x);

/** De los módulos que devuelve la base (en cualquier orden, quizá con valores desconocidos) deja los válidos, sin repetir, en el orden de la plataforma. */
export function ordenarModulos(ids: readonly unknown[]): ModuloId[] {
  const hay = new Set(ids.filter(esModulo));
  return MODULOS.filter((m) => hay.has(m.id)).map((m) => m.id);
}

export const nombreModulo = (id: ModuloId): string => MODULOS.find((m) => m.id === id)?.nombre ?? id;

export const ROLES = ['administrador', 'direccion', 'community_manager', 'disenador', 'cliente'] as const;
export type Rol = (typeof ROLES)[number];
export const esRol = (x: unknown): x is Rol => typeof x === 'string' && (ROLES as readonly string[]).includes(x);

export const ETIQUETA_ROL: Record<Rol, string> = {
  administrador: 'Administrador', direccion: 'Dirección', community_manager: 'Community Manager', disenador: 'Diseñador', cliente: 'Cliente',
};

export type Tema = 'claro' | 'oscuro' | 'sistema';
export const esTema = (x: unknown): x is Tema => x === 'claro' || x === 'oscuro' || x === 'sistema';
