export type AfipImpuesto = {
  descripcion: string;
  periodo: string | null;
};

export type AfipActividad = {
  codigo: string | null;
  descripcion: string;
  periodo: string | null;
};

export type AfipDomicilio = {
  texto: string | null;
  calle: string | null;
  localidad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
};

export type AfipCondicionFiscal =
  | "MONOTRIBUTO"
  | "RESPONSABLE_INSCRIPTO"
  | "EXENTO"
  | "NO_INSCRIPTO"
  | null;

export type AfipConstancia = {
  cuit: string;
  denominacion: string | null;
  tipoPersona: string | null;
  condicionFiscal: AfipCondicionFiscal;
  categoriaMonotributo: string | null;
  fechaContratoSocial: string | null;
  impuestos: AfipImpuesto[];
  actividades: AfipActividad[];
  domicilioFiscal: AfipDomicilio;
  html: string | null;
  error: string | null;
};

export type AfipCaptchaChallenge = {
  token: string;
  imageBase64: string;
};

export type CookieJar = Map<string, string>;
