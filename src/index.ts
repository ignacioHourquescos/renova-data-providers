import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { syncWegaPriceListFromFirestore } from "./providers/wega/priceList.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "renova-data-providers listening");
  void syncWegaPriceListFromFirestore(true);
});
