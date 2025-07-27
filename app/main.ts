import { createInterface } from "readline";
import {
  existsSync,
  accessSync,
  constants,
  statSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "fs";
import { spawn } from "child_process";
import { parse } from "shell-quote";
import { execSync as childExecSync } from "child_process";
import chalk, { chalkStderr } from "chalk"
import cfonts from 'cfonts';

cfonts.say('Drift', {
  font: 'block',
  align: 'left',
  colors: ['blue', 'cyan'],
});

const getPrompt = () => {
  const user = process.env.USER || "user";
  const cwd = process.cwd().split("/").pop();
  return chalk.greenBright(`${user}`) + chalk.gray(" at ") +
         chalk.green(`${cwd}`) + chalk.gray(" ➜ ") + chalk.yellowBright("$ ");
};

const builtinCommands = ["echo", "exit", "type", "pwd", "history"];
const pathDirs = process.env.PATH?.split(":") || [];

const completer = (line: string) => {
    const executables: string[] = []

    for (const path of pathDirs) {
    try {
      const files = execSync(`ls -1 ${path} 2>/dev/null`).toString().split('\n').filter(f => f)
      executables.push(...files)
    } catch {

    }
  }
  const hits = [...builtinCommands, ...executables].filter((c) => c.startsWith(line)).map(c => `${c} `)

  if (hits.length == 0){
    process.stdout.write("\x07");
  }
  return [hits, line]
  }


const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer
});

let historyElements: string[] = [];
let appendCounter = 0;

const echo = (args: string[], onComplete: () => void) => {
  process.stdout.write(chalk.blueBright(`${args.join(" ")}\n`));
  onComplete();
};

const pwd = (args: string[], onComplete: () => void) => {
  const currDir = process.cwd();
  process.stdout.write(chalk.blackBright(`${currDir}\n`));
  onComplete();
};

const cd = (args: string[], onComplete: () => void) => {
  let targetDir = args[0] || process.env.HOME;

  if (targetDir === "~") {
    targetDir = process.env.HOME;
  }

  if (!targetDir) {
    process.stderr.write(chalkStderr.redBright("cd: No directory specified and HOME not set\n"));
    onComplete();
    return;
  }
  try {
    if (existsSync(targetDir) && statSync(targetDir).isDirectory()) {
      process.chdir(targetDir);
    } else {
      process.stderr.write(chalkStderr.redBright(`cd: ${targetDir}: No such file or directory\n`));
    }
  } catch (err: any) {
    process.stderr.write(chalkStderr.redBright(`cd: ${err.message}\n`));
  }
  onComplete();
};

const saveHistory = () => {
  const histFile = process.env.HISTFILE;
  if (histFile && existsSync(histFile)) {
    try {
      const historyContent = readFileSync(histFile, "utf-8");
      const commands = historyContent
        .split("\n")
        .map((cmd) => cmd.trim())
        .filter((cmd) => cmd !== "");
      historyElements.push(...commands);
    } catch (error) {
      console.error(`Failed to load history from ${histFile}:`, error);
    }
  }
};

const history = (args: string[], onComplete: () => void) => {
  const num = parseInt(args[0], 10);
  const count = !isNaN(num) ? num : historyElements.length;

  const start = Math.max(historyElements.length - count, 0);
  if (args[0] === "-r" && args[1]) {
    const filePath = args[1] || ".history";
    try {
      const fileContent = readFileSync(filePath, "utf-8");
      const lines = fileContent
        .split("\n")
        .filter((line) => line.trim() !== "");
      historyElements.push(...lines);
    } catch (err: any) {
      process.stderr.write(chalkStderr.redBright(`Error reading history file: ${err.message}\n`));
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
      process.stderr.write(chalkStderr.redBright(`history -w: ${err.message}\n`));
    }
  } else if (args[0] === "-a" && args[1]) {
    const filePath = args[1];

    try {
      const lastElements = historyElements.slice(appendCounter);
      for (const line of lastElements) {
        appendFileSync(filePath, line + "\n", "utf-8");
      }
      appendCounter += historyElements.length;
      onComplete();
      return;
    } catch (err: any) {
      process.stderr.write(chalkStderr.redBright(`history -w: ${err.message}\n`));
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
    process.stdout.write(chalkStderr.redBright(`${input} is a shell builtin\n`));
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

  process.stdout.write(chalk.red(`${input}: not found\n`));
  onComplete();
};

const saveHistoryOnExit = () => {
  const histFile = process.env.HISTFILE;
  if (!histFile) return;

  try {
    writeFileSync(histFile, historyElements.join("\n") + "\n", "utf-8");
  } catch (err: any) {
    process.stderr.write(chalkStderr.redBright(`Failed to write history: ${err.message}\n`));
  }}

const exit = (args: string[]) => {
  const code = args[0] ? parseInt(args[0], 10) : 0;
  saveHistoryOnExit();
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
    process.stdout.write(chalkStderr.redBright(`${command}: command not found\n`));
    onComplete();
    return;
  }

  const childProcess = spawn(executablePath, args, {
    stdio: "inherit",
    argv0: command,
  });

  childProcess.on("close", () => onComplete());
  childProcess.on("error", (err) => {
    process.stderr.write(chalkStderr.redBright(`Failed to start subprocess: ${err.message}\n`));
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
  rl.question(getPrompt(), (input: string) => {
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

saveHistory();
main();
function execSync(command: string) {
  return childExecSync(command);
}

