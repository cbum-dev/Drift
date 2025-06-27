import { createInterface } from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const builtins = ["echo", "exit", "type"];

const isExecutable = (filePath: string): boolean => {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const findInPath = (cmd: string): string | null => {
  const pathDirs = process.env.PATH?.split(":") || [];
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    if (fs.existsSync(fullPath) && isExecutable(fullPath)) {
      return fullPath;
    }
  }
  return null;
};

const prompt = () => {
  rl.question("$ ", (input) => {
    const trimmed = input.trim();
    if (trimmed === "exit 0") {
      rl.close();
      process.exit(0);
    }

    const [command, ...args] = trimmed.split(" ");

    if (command === "echo") {
      console.log(args.join(" "));
    } else if (command === "type") {
      const target = args[0];
      if (!target) {
        console.log(`type: missing argument`);
      } else if (builtins.includes(target)) {
        console.log(`${target} is a shell builtin`);
      } else {
        const fullPath = findInPath(target);
        if (fullPath) {
          console.log(`${target} is ${fullPath}`);
        } else {
          console.log(`${target}: not found`);
        }
      }
    } else {
      console.log(`${command}: not found`);
    }

    prompt();
  });
};

prompt();
