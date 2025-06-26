import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = () => {
  rl.question("$ ", (answer) => {
    const trimmed = answer.trim();
    if (trimmed == "exit 0") {
      rl.close();
      return;
    }
    const [command, ...args] = trimmed.split(" ");

    if (command == "echo") {
      console.log(args.join(" "));
    } else {
      console.log(`${answer}: command not found`);
    }
    prompt();
  });
};

prompt();
