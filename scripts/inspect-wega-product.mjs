import { Agent, fetch } from "undici";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
const url = "https://wega.com.ar/catalogo/filtros/detalle/wo-200";
const res = await fetch(url, {
	dispatcher,
	headers: { "User-Agent": "Mozilla/5.0" },
});
const html = await res.text();
console.log("status", res.status, "len", html.length);
const out = path.join(__dirname, "wega-wo200.html");
fs.writeFileSync(out, html);

const lower = html.toLowerCase();
for (const key of [
	"altura",
	"medida",
	"diametro",
	"diámetro",
	"rosca",
	"junta",
	"especif",
	"dimension",
	"single-fact",
	"product-detail",
	"caracter",
	"datos",
	"mm",
]) {
	const i = lower.indexOf(key);
	console.log(key, i);
	if (i >= 0) {
		console.log(
			html
				.slice(Math.max(0, i - 120), i + 280)
				.replace(/\s+/g, " ")
				.slice(0, 320),
		);
	}
}

const ids = [...html.matchAll(/id="([^"]+)"/g)]
	.map((m) => m[1])
	.filter((x) => /fact|spec|med|dim|detail|tech|caract|dato/i.test(x));
const classes = [...html.matchAll(/class="([^"]+)"/g)]
	.flatMap((m) => m[1].split(/\s+/))
	.filter((x) => /fact|spec|med|dim|tech|caract|dato|medida|product/i.test(x));
console.log("ids", [...new Set(ids)].slice(0, 50));
console.log("classes", [...new Set(classes)].slice(0, 80));
