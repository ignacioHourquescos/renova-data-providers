# renova-data-providers

Servicio HTTP que consulta proveedores externos y normaliza la respuesta.

## Stack

- Node.js 20+
- TypeScript
- Express
- zod
- pino

## Primer proveedor: DNRPA

Consulta marca, modelo, tipo, año y origen a partir de una patente argentina.

```http
POST /api/dnrpa/search
Content-Type: application/json

{ "patente": "AA760VA" }
```

Respuesta OK:

```json
{
  "make": "TOYOTA",
  "model": "...",
  "type": "...",
  "year": "2017",
  "origin": "NACIONAL",
  "error": null
}
```

## Setup local

```bash
cp .env.example .env
# Editar .env y poner RECAPTCHA_SOLVER_API_KEY (2captcha)

npm install
npm run dev
```

Healthcheck: `GET http://localhost:3100/health`

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto HTTP (default `3100`) |
| `RECAPTCHA_SOLVER_API_KEY` | API key de 2captcha |
| `LOG_LEVEL` | Nivel de log pino (default `info`) |
