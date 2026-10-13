// `npm start` only: serve the backend under /api like nginx does in production. Point
// ACE_DEV_BACKEND at a local backend running with ACCESS_DEV_EMAIL set (no Cloudflare locally).
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = (app) => {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.ACE_DEV_BACKEND || "http://localhost:8000",
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
