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

Busca artículos por código (API autenticada con JWT), filtrando por marca y match exacto de código.
Lubaires puede devolver resultados fuzzy de varias marcas; cada endpoint solo deja ítems de esa marca cuyo código coincide (ignorando espacios/símbolos).
Aplica el descuento configurado en `src/providers/config.ts` (hoy 30%) sobre el precio del proveedor.

```http
POST /api/lubaires/mann/search
Content-Type: application/json

{ "code": "W7122" }
```

```http
POST /api/lubaires/wix/search
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

Config de scrapers (URL, descuento, credenciales): `src/providers/config.ts`.
El token se obtiene con login automático a `/users/login` y se renueva si la sesión expira.

### Goicoechea

Busca un artículo por código en `goicoechea.com.ar` (login con cookies + API JSON del buscador).
El **Costo** de la ficha se devuelve en `price` tal cual (neto, sin descuento extra). `listPrice` es Lista.
El stock se consulta para `quantity` (default 1). `inStock: true` si hay stock suficiente para esa cantidad.

```http
POST /api/goicoechea/search
Content-Type: application/json

{ "code": "AL12", "quantity": 1000 }
```

Respuesta OK:

```json
{
  "items": [
    {
      "code": "AL12",
      "name": "FILTRO SECADOR AIRE MERCEDES BENZ VOLVO IVECO MAN",
      "brand": "MAHLE",
      "price": 24739.32,
      "listPrice": 34360.16,
      "inStock": true,
      "stockLabel": "Stock Suficiente",
      "quantity": 1000
    }
  ],
  "error": null
}
```

Si el código no está, `items` viene vacío y `error` es `null`. Credenciales en `src/providers/config.ts`.

### Eagle

Stock de fábrica publicado en `https://eagle-stock.up.railway.app` (`GET /api/v1/stock`).
La búsqueda compara el código ignorando espacios, guiones y mayúsculas, igual que Eagle.
No hay precio: `quantity` es el stock (o `null` con `quantityLabel` «Más de 100» cuando Eagle oculta el número).
`inStock` indica si ese stock alcanza `quantity` del body (default 1). Si el número está oculto y se piden más de 100, `inStock` es `null`.
`brand` sale de un campo `Marca` o, si no hay, de la columna de almacén (ahí Eagle ya reemplazó el código de depósito por la marca).

```http
POST /api/eagle/search
Content-Type: application/json

{ "code": "C-4880 A", "quantity": 1 }
```

Respuesta OK:

```json
{
  "items": [
    {
      "code": "C-4880 A",
      "name": "U.S. PARA COMBUSTIBLE",
      "brand": "FRAM",
      "quantity": null,
      "quantityLabel": "Más de 100",
      "requested": 1,
      "inStock": true,
      "stockLabel": "Más de 100",
      "fields": { "Almacen": "FRAM" }
    }
  ],
  "updatedAt": "2026-09-23T12:00:00.000Z",
  "error": null
}
```

Si el código no está, `items` viene vacío y `error` es `null`. La API key está en `src/providers/config.ts` (se puede pisar con `EAGLE_API_KEY`).

### Wega

Catálogo de filtros por marca y modelo de vehículo. Scraper de `https://wega.com.ar/catalogo`.
Los valores `make` / `model` / `id` son **IDs numéricos internos de Wega** (ej: PEUGEOT = `"177"`), no nombres.
Cada modelo incluye `tipoVehiculo` (`1` auto, `2` utilitario/camioneta, `3` pesado). El catálogo prueba esos tipos si no viene `tipoVehiculo` en el body (necesario para Hilux y similares).

```http
GET /api/wega/makes
```

```http
POST /api/wega/models
Content-Type: application/json

{ "id": "177" }
```

```http
POST /api/wega/catalogue
Content-Type: application/json

{ "make": "177", "model": "1234" }
```

Respuesta OK de catálogo:

```json
{
  "headers": ["Motor", "Modelo", "Año", "Aire", "Aceite", "Combustible", "Habitaculo"],
  "rows": [
    {
      "Motor": "HDI - 1,6 HDI 110 112cv",
      "Año": "2009 ->",
      "Aire": "FAP-4892",
      "Aceite": "WO-110"
    }
  ],
  "error": null
}
```

El listado de marcas es un snapshot estático (`src/providers/wega/makes.ts`). URL en `src/providers/config.ts`.

Ficha de producto (equivalencia FRAM + imagen). No se enriquece el catálogo en caliente: hay que resolver códigos aparte, con cache LRU (6 h).

```http
POST /api/wega/resolve
Content-Type: application/json

{ "codes": ["FAP-2219", "WO-110"] }
```

```json
{
  "items": {
    "FAP-2219": {
      "wegaCode": "FAP-2219",
      "framCode": "CA 12104",
      "imageUrl": "https://wega.com.ar/images/productos/....webp",
      "equivalencias": [
        { "brand": "WEGA", "code": "FAP-2219" },
        { "brand": "FRAM", "code": "CA 12104" }
      ]
    }
  },
  "error": null
}
```

Si un código no tiene FRAM o la ficha no existe, `framCode` e `imageUrl` vienen `null`. Máximo 60 códigos por request, 4 scrapes en paralelo.

Precio de lista del proveedor (Excel subida en Listas de precios). **No hay stock.** `price` es el costo = lista × (1 − descuento). Hay que ingestar la Excel antes de consultar.

```http
POST /api/wega/price-list
Content-Type: application/json

{
  "fileUrl": "https://.../Lista_de_Precios_Mayo.xlsx",
  "codeColumn": "CODIGO",
  "priceColumn": "PRECIO",
  "discountPercent": 53,
  "monthKey": "2026-05"
}
```

Solo actualizar el descuento (sin re-bajar el archivo):

```http
POST /api/wega/price-list
Content-Type: application/json

{ "discountPercent": 53 }
```

```http
POST /api/wega/price
Content-Type: application/json

{ "code": "JFO0514" }
```

```json
{
  "items": [
    {
      "code": "JFO 0514",
      "brand": "WEGA",
      "price": 7173.08,
      "listPrice": 15261.88,
      "discountPercent": 53
    }
  ],
  "error": null
}
```

Si el código no está, `items` viene vacío y `error` es `null`. Si no hay lista ingestada, `error` lo indica. Sin `stockLabel` / `inStock`.

### MANN-FILTER

Catálogo de filtros por marca → modelo → versión (motor), vía GraphQL de `https://www.mann-filter.com` (`/api/graphql/catalog-prod`).
No hay listado estático de marcas: se buscan por autocomplete. Los IDs son los internos de MANN (ej. RENAULT autos = `"00000000000091"`).

Precios por código siguen en Lubaires: `POST /api/lubaires/mann/search`.

```http
POST /api/mann/makes
Content-Type: application/json

{ "search": "RENAULT" }
```

```json
{
  "makes": [
    {
      "id": "00000000000091",
      "name": "RENAULT",
      "zone": "Cars + Transporters",
      "segmentId": "01",
      "categoryId": ""
    }
  ],
  "error": null
}
```

```http
POST /api/mann/models
Content-Type: application/json

{ "id": "00000000000091", "q": "Logan" }
```

`categoryId` es opcional (viene en el make). `q` filtra por nombre de modelo.

```http
POST /api/mann/versions
Content-Type: application/json

{ "model": "00000000018267" }
```

```http
POST /api/mann/catalogue
Content-Type: application/json

{ "version": "00000003956642" }
```

Respuesta OK de catálogo:

```json
{
  "items": [
    {
      "code": "C27030",
      "sku": "C27030_MANN-FILTER",
      "type": "Air Filter",
      "urlKey": "c27030_mann-filter",
      "notes": [],
      "fitsFrom": "1900-01-01",
      "fitsTo": "9999-12-31"
    }
  ],
  "filters": [
    { "code": "ALL_FILTER", "label": "All", "total": 7 },
    { "code": "AIR_FILTER", "label": "Air Filter", "total": 1 }
  ],
  "totalCount": 7,
  "error": null
}
```

Ficha / equivalencias (FRAM, WIX, etc.) con cache LRU 6 h:

```http
POST /api/mann/resolve
Content-Type: application/json

{ "codes": ["C 27 030", "C27030_MANN-FILTER"] }
```

```json
{
  "items": {
    "C 27 030": {
      "mannCode": "C27030",
      "sku": "C27030_MANN-FILTER",
      "imageUrl": null,
      "framCodes": ["CA11654", "CA12143"],
      "wegaCodes": [],
      "equivalencias": [
        { "brand": "FRAM", "code": "CA11654" },
        { "brand": "WIX", "code": "WA9770" }
      ]
    }
  },
  "error": null
}
```

### FRAM

Catálogo de filtros por marca, modelo y versión. Scraper de `https://catalogofram.com.ar`.
A diferencia de Wega, FRAM usa **nombres** como IDs (`PEUGEOT`, `308`, `1.6 HDI`) y pide un paso extra de versión.

```http
GET /api/fram/makes
```

```http
POST /api/fram/models
Content-Type: application/json

{ "id": "PEUGEOT" }
```

```http
POST /api/fram/versions
Content-Type: application/json

{ "make": "PEUGEOT", "model": "308" }
```

```http
POST /api/fram/catalogue
Content-Type: application/json

{ "make": "PEUGEOT", "model": "308", "version": "1.6 HDI" }
```

Respuesta OK de catálogo:

```json
{
  "headers": ["Aplicacion", "Año", "Aire", "Aceite", "Combustible", "Habitaculo", "Otros"],
  "rows": [
    {
      "Aplicacion": "PEUGEOT 308 1.6 HDI DIESEL 2011 a 2015",
      "Año": "2011 -> 2015",
      "Aire": "CA11072",
      "Aceite": "CH9657",
      "Combustible": "P11047",
      "Habitaculo": "CF9398",
      "Otros": ""
    }
  ],
  "error": null
}
```

Ficha de producto (imagen + equivalencia WEGA). Se llama aparte, con cache LRU (6 h):

```http
POST /api/fram/resolve
Content-Type: application/json

{ "codes": ["CA 12104"] }
```

```json
{
  "items": {
    "CA 12104": {
      "framCode": "CA12104",
      "wegaCode": "FAP2219",
      "imageUrl": "https://production-specparts-search-api-images-bucket.s3.amazonaws.com/...",
      "equivalencias": [{ "brand": "WEGA", "code": "FAP2219" }]
    }
  },
  "error": null
}
```

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

URL, credenciales y descuento de Lubaires, y credenciales de Goicoechea, viven en `src/providers/config.ts`.
