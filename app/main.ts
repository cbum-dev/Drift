import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = () => {
  rl.question("$ ", (answer) => {
    if (answer == "exit 0") {
      rl.close();
      return;
    }
    console.log(`${answer}: command not found`);
    prompt();
  });
};

prompt();
