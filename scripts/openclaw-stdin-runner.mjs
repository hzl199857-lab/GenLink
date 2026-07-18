import { pathToFileURL } from "node:url";

const [openClawEntry, ...openClawArgs] = process.argv.slice(2);

if (!openClawEntry) {
  throw new Error("OpenClaw entry path is required");
}

process.stdin.setEncoding("utf8");

let message = "";
for await (const chunk of process.stdin) {
  message += chunk;
}

if (!message.trim()) {
  throw new Error("OpenClaw stdin message is required");
}

process.argv = [
  process.execPath,
  openClawEntry,
  ...openClawArgs,
  "--message",
  message,
];

await import(pathToFileURL(openClawEntry).href);
