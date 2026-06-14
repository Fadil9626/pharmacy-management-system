// Remedy — pharmacy management. The backend also serves the built frontend (frontend/dist).
module.exports = {
  apps: [
    {
      name: "remedy",
      cwd: __dirname + "/backend",
      script: "server.js",
      env: { NODE_ENV: "production" },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
