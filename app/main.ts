import { createInterface } from "readline";
import { existsSync,accessSync, constants,statSync } from "fs";
import { spawn } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const builtinCommands = ["echo", "exit", "type","pwd"];

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
  const targetDir = args[0] || process.env.HOME;

  if(!targetDir){
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

}

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
  exit: (args) => exit(args),
};

const main = (): void => {
  rl.question("$ ", (input: string) => {
    const tokens = input.trim().split(/\s+/).filter(Boolean);
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