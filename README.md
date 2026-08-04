# renova-data-providers

Servicio HTTP que consulta proveedores externos y normaliza la respuesta.

## Stack

- Node.js 20+
- TypeScript
- Express
- zod
- pino

## Proveedores

### DNRPA

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

### Lubaires

Busca artículos por código o texto (API autenticada con JWT).
Aplica el descuento configurado en `src/providers/config.ts` (hoy 30%) sobre el precio del proveedor.

```http
POST /api/lubaires/search
Content-Type: application/json

{ "code": "WL10489A" }
```

Respuesta OK:

```json
{
  "items": [
    {
      "code": "WL10489A",
      "name": "Fiat Fire W610/3",
      "brand": "WIX",
      "price": 1610.15,
      "providerPrice": 2300.21,
      "listPrice": 2686,
      "publicPrice": 2851.5,
      "discountPercent": 30,
      "stockLabel": "EN STOCK",
      "stockStatus": "STOCK",
      "isOffer": true
    }
  ],
  "error": null
}
```

Config de scrapers (URL, descuento, etc.): `src/providers/config.ts`

## Setup local

```bash
cp .env.example .env
# Editar .env: RECAPTCHA_SOLVER_API_KEY (2captcha)

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

URL, token y descuento de Lubaires viven en `src/providers/config.ts`.
