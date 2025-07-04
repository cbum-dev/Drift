import { createInterface } from "readline";
import {
  existsSync,
  accessSync,
  constants,
  statSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { spawn } from "child_process";
import { parse } from "shell-quote";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

let historyElements: string[] = [];
const builtinCommands = ["echo", "exit", "type", "pwd", "history"];

const echo = (args: string[], onComplete: () => void) => {
  process.stdout.write(`${args.join(" ")}\n`);
  onComplete();
};

const pwd = (args: string[], onComplete: () => void) => {
  const currDir = process.cwd();
  process.stdout.write(`${currDir}\n`);
  onComplete();
};

const cd = (args: string[], onComplete: () => void) => {
  let targetDir = args[0] || process.env.HOME;

  if (targetDir === "~") {
    targetDir = process.env.HOME;
  }

  if (!targetDir) {
    process.stderr.write("cd: No directory specified and HOME not set\n");
    onComplete();
    return;
  }
  try {
    if (existsSync(targetDir) && statSync(targetDir).isDirectory()) {
      process.chdir(targetDir);
    } else {
      process.stderr.write(`cd: ${targetDir}: No such file or directory\n`);
    }
  } catch (err: any) {
    process.stderr.write(`cd: ${err.message}\n`);
  }
  onComplete();
};

const history = (args: string[], onComplete: () => void) => {
  const num = parseInt(args[0], 10);
  const count = !isNaN(num) ? num : historyElements.length;

  const start = Math.max(historyElements.length - count, 0);
  if (args[0] === "-r") {
    const filePath = args[1] || ".history";
    try {
      const fileContent = readFileSync(filePath, "utf-8");
      const lines = fileContent
        .split("\n")
        .filter((line) => line.trim() !== "");
      historyElements.push(...lines);
    } catch (err: any) {
      process.stderr.write(`Error reading history file: ${err.message}\n`);
    }
    onComplete();
    return;
  } else if (args[0] === "-w" && args[1]) {
    const filePath = args[1];

    try {
      writeFileSync(filePath, historyElements.join("\n") + "\n", "utf-8");
      onComplete();
      return;
    } catch (err: any) {
      process.stderr.write(`history -w: ${err.message}\n`);
    }
  }

  for (let i = start; i < historyElements.length; i++) {
    const cmd = historyElements[i];
    process.stdout.write(`${i + 1}  ${cmd}\n`);
  }

  onComplete();
};
const type = (args: string[], onComplete: () => void) => {
  const input = args[0] || "";
  const paths = process.env["PATH"]?.split(":") || [];

  if (builtinCommands.includes(input)) {
    process.stdout.write(`${input} is a shell builtin\n`);
    onComplete();
    return;
  }

  for (const path of paths) {
    if (!path) continue;
    const filePath = `${path}/${input}`;
    try {
      accessSync(filePath, constants.X_OK);
      process.stdout.write(`${input} is ${filePath}\n`);
      onComplete();
      return;
    } catch {}
  }

  process.stdout.write(`${input}: not found\n`);
  onComplete();
};

const exit = (args: string[]) => {
  const code = args[0] ? parseInt(args[0], 10) : 0;
  process.exit(isNaN(code) ? 1 : code);
};

const executeExternalCommand = (
  command: string,
  args: string[],
  onComplete: () => void
) => {
  const paths = process.env["PATH"]?.split(":") || [];

  let executablePath: string | null = null;
  for (const path of paths) {
    if (!path) continue;
    const fullPath = `${path}/${command}`;
    try {
      accessSync(fullPath, constants.X_OK);
      executablePath = fullPath;
      break;
    } catch {}
  }

  if (!executablePath) {
    process.stdout.write(`${command}: command not found\n`);
    onComplete();
    return;
  }

  const childProcess = spawn(executablePath, args, {
    stdio: "inherit",
    argv0: command,
  });

  childProcess.on("close", () => onComplete());
  childProcess.on("error", (err) => {
    process.stderr.write(`Failed to start subprocess: ${err.message}\n`);
    onComplete();
  });
};

const handlers: Record<
  string,
  (args: string[], onComplete: () => void) => void
> = {
  echo,
  cd,
  type,
  pwd,
  history,
  exit: (args) => exit(args),
};

const main = (): void => {
  rl.question("$ ", (input: string) => {
    historyElements.push(input);
    const tokens = parse(input).filter(
      (t: any) => typeof t === "string"
    ) as string[];
    if (tokens.length === 0) {
      main();
      return;
    }

    const [command, ...args] = tokens;
    const next = () => main();

    if (handlers[command]) {
      handlers[command](args, next);
    } else {
      executeExternalCommand(command, args, next);
    }
  });
};

main();
