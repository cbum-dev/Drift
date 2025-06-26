import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = () => {
  rl.question("$ ", (answer) => {
    const trimmed = answer.trim();
    if (trimmed === "exit 0") {
      rl.close();
      process.exit(0);
    }

    const [command, ...args] = trimmed.split(" ");

    if (command === "echo") {
      console.log(args.join(" "));
    } else if (command === "type") {
      const target = args[0];
      if (["echo", "exit", "type"].includes(target)) {
        console.log(`${target} is a shell builtin`);
      } else {
        console.log(`${target}: not found`);
      }
    } else {
      console.log(`${command}: not found`);
    }

    prompt();
  });
};

prompt();
