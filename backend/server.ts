import { createApp } from './src/app';
import { readConfig } from './src/config';
const config = readConfig();
const { app } = createApp(config);
const server = app.listen(config.PORT, '0.0.0.0');
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000).unref();
});
