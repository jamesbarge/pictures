module.exports = {
  apps: [
    {
      name: "pictures-scraper",
      script: "src/scheduler/index.ts",
      interpreter: "npx",
      interpreter_args: "tsx -r tsconfig-paths/register",
      env_file: ".env.local",
      max_memory_restart: "2G",
      autorestart: true,
      watch: false,
      out_file: "logs/scheduler-out.log",
      error_file: "logs/scheduler-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
