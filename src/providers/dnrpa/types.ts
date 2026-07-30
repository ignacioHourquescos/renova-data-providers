export type DnrpaVehicle = {
  make: string | null;
  model: string | null;
  type: string | null;
  year: string | null;
  origin: string | null;
  error: string | null;
};

export type DnrpaApiResponse = {
  Transferencia?: {
    Marca?: string;
    Modelo?: string;
    Tipo?: string;
    Anio?: number | string;
    Origen?: string;
  };
};
