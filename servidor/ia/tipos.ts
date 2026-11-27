// Contrato de la capa de IA. Los valores coinciden con los enum de la base (0001): proveedor_ia, modo_ia, formato_pieza.
// Solo sintaxis "borrable" de TypeScript (sin enum ni propiedades en el constructor): corre tal cual en Node y en Next.js.

export const PROVEEDORES = ['claude', 'chatgpt', 'gemini'] as const;
export type Proveedor = (typeof PROVEEDORES)[number];

export const MODOS = ['ideas', 'copies', 'guiones', 'campanas', 'calendario', 'analizar_marca', 'tarea_desde_idea'] as const;
export type Modo = (typeof MODOS)[number];

export const FORMATOS = ['post', 'reel', 'historia', 'carrusel', 'banner'] as const;
export type Formato = (typeof FORMATOS)[number];

/** Una propuesta de la IA. Se guarda en mensajes_ia.elementos; una persona decide si la convierte en idea o tarea. */
export interface Elemento { titulo: string; cuerpo: string; formato: Formato; fecha?: string }

export interface Turno { rol: 'usuario' | 'asistente'; texto: string }
export interface PeticionModelo { sistema: string; historial: Turno[]; maxTokensSalida: number }
export interface SalidaModelo { texto: string; modelo: string; tokensEntrada: number; tokensSalida: number }

export interface Adaptador {
  readonly proveedor: Proveedor;
  readonly modelo: string;
  generar(peticion: PeticionModelo, senal: AbortSignal): Promise<SalidaModelo>;
}

const ERRORES = {
  datos_invalidos: [400, 'La solicitud no es válida.'],
  sin_sesion: [401, 'Inicia sesión para usar el asistente.'],
  origen_no_permitido: [403, 'La solicitud no viene de la aplicación.'],
  no_encontrada: [404, 'No se encontró la conversación o la marca.'],
  limite_uso: [429, 'Alcanzaste el límite de uso de IA de las últimas 24 horas.'],
  proveedor_rechazo: [502, 'El proveedor rechazó la solicitud. Avisa a un administrador para revisar la configuración.'],
  respuesta_vacia: [502, 'El modelo no devolvió contenido. Inténtalo de nuevo.'],
  proveedor_no_configurado: [503, 'Este modelo todavía no está conectado en el servidor.'],
  proveedor_saturado: [503, 'El proveedor no está disponible en este momento. Inténtalo de nuevo en unos minutos.'],
  tiempo_agotado: [504, 'El modelo tardó demasiado en responder. Inténtalo de nuevo.'],
  error_interno: [500, 'Ocurrió un error inesperado.'],
} as const;
export type CodigoError = keyof typeof ERRORES;

/** Error con mensaje seguro para mostrar a la persona: nunca lleva claves, peticiones ni respuestas crudas del proveedor. */
export class ErrorIA extends Error {
  readonly codigo: CodigoError;
  readonly estado: number;
  constructor(codigo: CodigoError, mensaje?: string) {
    super(mensaje ?? ERRORES[codigo][1]);
    this.name = 'ErrorIA';
    this.codigo = codigo;
    this.estado = ERRORES[codigo][0];
  }
}
