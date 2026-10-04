import { createApiServer } from './http.js';

const port = Number(process.env.PORT || 8788);
createApiServer().listen(port, () => console.error(`robot-town API on http://localhost:${port}/api/functions`));
