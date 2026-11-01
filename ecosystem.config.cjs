// pm2-Konfiguration für den Raspberry Pi (wird von scripts/pi-install.sh verwendet)
const path = require("path");

// Port wird von deploy-pi.ps1 gesetzt, Standard 3003
const PORT = process.env.APP_PORT || "3003";
// Node-Binary (Node 22), unabhängig vom Node anderer pm2-Apps
const NODE = process.env.APP_NODE || "node";

module.exports = {
  apps: [
    {
      name: "family",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules", "next", "dist", "bin", "next"),
      args: `start -p ${PORT} -H 0.0.0.0`,
      interpreter: NODE,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
};
