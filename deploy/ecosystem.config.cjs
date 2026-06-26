module.exports = {
  apps: [
    {
      name: "genlink",
      cwd: "/www/GenLink",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3002",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "768M",
      time: true,
    },
  ],
};
