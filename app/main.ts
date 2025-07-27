import { createInterface } from "readline";
import {
  existsSync,
  accessSync,
  constants,
  statSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "fs";
import { spawn } from "child_process";
import { parse } from "shell-quote";
import { execSync as childExecSync } from "child_process";
import chalk, { chalkStderr } from "chalk";
import cfonts from 'cfonts';
import { homedir, hostname, userInfo } from 'os';
import { join } from 'path';

cfonts.say('Drift Shell', {
  font: 'block',
  align: 'center',
  colors: ['#00D4AA', '#0099CC'],
  background: 'transparent',
  letterSpacing: 1,
  lineHeight: 1,
  space: true,
  maxLength: '0',
});

console.log(chalk.cyan('🚀 Welcome to Drift Shell - Your Enhanced Terminal Experience'));
console.log(chalk.gray(`Version 1.0.2 | ${new Date().toLocaleDateString()}`));
console.log(chalk.gray('─'.repeat(60)));

const config = {
  theme: {
    primary: '#00D4AA',
    secondary: '#0099CC', 
    success: '#00FF88',
    warning: '#FFB700',
    error: '#FF6B6B',
    muted: '#6C7B7F'
  },
  git: {
    showStatus: true,
    showBranch: true,
    showAhead: true
  },
  prompt: {
    showTime: true,
    showHostname: false,
    showNodeVersion: false,
    compactMode: false
  }
};

const getGitInfo = () => {
  try {
    execSync('git rev-parse --git-dir 2>/dev/null');
    
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null').toString().trim();
    const status = execSync('git status --porcelain 2>/dev/null').toString().trim();
    
    let ahead = 0;
    let behind = 0;
    try {
      const aheadBehind = execSync('git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null').toString().trim();
      const [behindStr, aheadStr] = aheadBehind.split('\t');
      behind = parseInt(behindStr) || 0;
      ahead = parseInt(aheadStr) || 0;
    } catch {}

    const staged = status.split('\n').filter(line => line[0] !== ' ' && line[0] !== '?').length;
    const modified = status.split('\n').filter(line => line[1] !== ' ' && line[1] !== '?').length;
    const untracked = status.split('\n').filter(line => line.startsWith('??')).length;

    return {
      branch,
      staged,
      modified,
      untracked,
      ahead,
      behind,
      clean: status === ''
    };
  } catch {
    return null;
  }
};

const formatGitStatus = (gitInfo: any) => {
  if (!gitInfo) return '';
  
  let gitStr = ` ${chalk.hex('#FF6B6B')('git')}:${chalk.hex('#00D4AA')(gitInfo.branch)}`;
  
  const indicators = [];
  if (gitInfo.staged > 0) indicators.push(chalk.hex('#00FF88')(`+${gitInfo.staged}`));
  if (gitInfo.modified > 0) indicators.push(chalk.hex('#FFB700')(`~${gitInfo.modified}`));
  if (gitInfo.untracked > 0) indicators.push(chalk.hex('#FF6B6B')(`?${gitInfo.untracked}`));
  if (gitInfo.ahead > 0) indicators.push(chalk.hex('#0099CC')(`↑${gitInfo.ahead}`));
  if (gitInfo.behind > 0) indicators.push(chalk.hex('#FF6B6B')(`↓${gitInfo.behind}`));
  
  if (indicators.length > 0) {
    gitStr += ` [${indicators.join(' ')}]`;
  } else if (gitInfo.clean) {
    gitStr += ` ${chalk.hex('#00FF88')('✓')}`;
  }
  
  return gitStr;
};

const getPrompt = () => {
  const user = userInfo().username;
  const host = hostname();
  const cwd = process.cwd();
  const cwdName = cwd === homedir() ? '~' : cwd.split('/').pop() || '/';
  const gitInfo = config.git.showStatus ? getGitInfo() : null;
  
  let prompt = '';
  
  if (config.prompt.showTime) {
    const time = new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    prompt += chalk.hex(config.theme.muted)(`[${time}] `);
  }
  
  prompt += chalk.hex(config.theme.primary)(user);
  
  if (config.prompt.showHostname) {
    prompt += chalk.hex(config.theme.muted)('@') + chalk.hex(config.theme.secondary)(host);
  }
  
  prompt += chalk.hex(config.theme.muted)(' in ') + chalk.hex(config.theme.success)(cwdName);
  
  if (gitInfo) {
    prompt += formatGitStatus(gitInfo);
  }
  
  if (config.prompt.showNodeVersion) {
    prompt += chalk.hex(config.theme.muted)(` node:${process.version}`);
  }
  
  prompt += '\n' + chalk.hex(config.theme.primary)('❯ ');
  
  return prompt;
};

const builtinCommands = [
  "echo", "exit", "type", "pwd", "history", "cd", "ls", "clear", 
  "theme", "config", "git-status", "alias", "which", "help"
];

const pathDirs = process.env.PATH?.split(":") || [];

const completer = (line: string) => {
  const words = line.split(' ');
  const currentWord = words[words.length - 1];
  
  if (words.length === 1) {
    const executables: string[] = [];
    
    for (const path of pathDirs) {
      try {
        const files = execSync(`ls -1 ${path} 2>/dev/null`).toString().split('\n').filter(f => f);
        executables.push(...files);
      } catch {}
    }
    
    const hits = [...builtinCommands, ...executables]
      .filter((c) => c.startsWith(currentWord))
      .map(c => `${c} `);
    
    if (hits.length === 0) {
      process.stdout.write("\x07");
    }
    return [hits, currentWord];
  } else {
    try {
      const dirPath = currentWord.includes('/') ? 
        currentWord.substring(0, currentWord.lastIndexOf('/')) : '.';
      const prefix = currentWord.includes('/') ? 
        currentWord.substring(currentWord.lastIndexOf('/') + 1) : currentWord;
      
      const files = readdirSync(dirPath === '' ? '.' : dirPath)
        .filter(f => f.startsWith(prefix))
        .map(f => {
          const fullPath = join(dirPath === '.' ? '' : dirPath, f);
          return statSync(fullPath).isDirectory() ? `${f}/` : f;
        });
      
      return [files, prefix];
    } catch {
      return [[], currentWord];
    }
  }
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer,
  historySize: 1000
});

let historyElements: string[] = [];
let appendCounter = 0;
let aliases: Record<string, string> = {};

const loadAliases = () => {
  const aliasFile = join(homedir(), '.drift_aliases');
  if (existsSync(aliasFile)) {
    try {
      const content = readFileSync(aliasFile, 'utf-8');
      content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          aliases[key.trim()] = valueParts.join('=').trim();
        }
      });
    } catch {}
  }
};

const saveAliases = () => {
  const aliasFile = join(homedir(), '.drift_aliases');
  try {
    const content = Object.entries(aliases)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    writeFileSync(aliasFile, content, 'utf-8');
  } catch {}
};

const echo = (args: string[], onComplete: () => void) => {
  const message = args.join(' ');
  const colorized = message
    .replace(/\\033\[(\d+)m/g, (_, code) => {
      const colors: Record<string, any> = {
        '31': chalk.red, '32': chalk.green, '33': chalk.yellow,
        '34': chalk.blue, '35': chalk.magenta, '36': chalk.cyan,
        '37': chalk.white, '0': chalk.reset
      };
      return colors[code] ? '' : '';
    });
  
  process.stdout.write(chalk.hex(config.theme.primary)(`${message}\n`));
  onComplete();
};

const pwd = (args: string[], onComplete: () => void) => {
  const currDir = process.cwd();
  process.stdout.write(chalk.hex(config.theme.success)(`${currDir}\n`));
  onComplete();
};

const ls = (args: string[], onComplete: () => void) => {
  const showHidden = args.includes('-a') || args.includes('-la') || args.includes('-al');
  const longFormat = args.includes('-l') || args.includes('-la') || args.includes('-al');
  const targetDir = args.find(arg => !arg.startsWith('-')) || '.';
  
  try {
    const files = readdirSync(targetDir);
    const filteredFiles = showHidden ? files : files.filter(f => !f.startsWith('.'));
    
    if (longFormat) {
      filteredFiles.forEach(file => {
        try {
          const stat = statSync(join(targetDir, file));
          const size = stat.size.toString().padStart(8);
          const modified = stat.mtime.toLocaleDateString();
          const type = stat.isDirectory() ? 'd' : '-';
          const permissions = '755'; // Simplified
          
          const color = stat.isDirectory() ? 
            chalk.hex(config.theme.primary) : 
            chalk.hex(config.theme.muted);
          
          process.stdout.write(`${type}rwxr-xr-x ${size} ${modified} ${color(file)}\n`);
        } catch {
          process.stdout.write(chalk.hex(config.theme.error)(`${file} (permission denied)\n`));
        }
      });
    } else {
      const columns = Math.floor(process.stdout.columns / 20) || 4;
      for (let i = 0; i < filteredFiles.length; i += columns) {
        const row = filteredFiles.slice(i, i + columns);
        const formatted = row.map(file => {
          try {
            const isDir = statSync(join(targetDir, file)).isDirectory();
            const color = isDir ? chalk.hex(config.theme.primary) : chalk.hex(config.theme.muted);
            return color(file.padEnd(18));
          } catch {
            return chalk.hex(config.theme.error)(file.padEnd(18));
          }
        }).join(' ');
        process.stdout.write(`${formatted}\n`);
      }
    }
  } catch (err: any) {
    process.stderr.write(chalkStderr.hex(config.theme.error)(`ls: ${err.message}\n`));
  }
  onComplete();
};

const clear = (args: string[], onComplete: () => void) => {
  process.stdout.write('\x1b[2J\x1b[0f');
  onComplete();
};

const gitStatus = (args: string[], onComplete: () => void) => {
  const gitInfo = getGitInfo();
  if (!gitInfo) {
    process.stdout.write(chalk.hex(config.theme.error)('Not a git repository\n'));
    onComplete();
    return;
  }
  
  process.stdout.write(chalk.hex(config.theme.primary)('Git Status:\n'));
  process.stdout.write(`Branch: ${chalk.hex(config.theme.success)(gitInfo.branch)}\n`);
  
  if (gitInfo.clean) {
    process.stdout.write(chalk.hex(config.theme.success)('Working directory clean ✓\n'));
  } else {
    if (gitInfo.staged > 0) {
      process.stdout.write(`Staged: ${chalk.hex(config.theme.success)(gitInfo.staged)} files\n`);
    }
    if (gitInfo.modified > 0) {
      process.stdout.write(`Modified: ${chalk.hex(config.theme.warning)(gitInfo.modified)} files\n`);
    }
    if (gitInfo.untracked > 0) {
      process.stdout.write(`Untracked: ${chalk.hex(config.theme.error)(gitInfo.untracked)} files\n`);
    }
  }
  
  if (gitInfo.ahead > 0) {
    process.stdout.write(`Ahead: ${chalk.hex(config.theme.primary)(gitInfo.ahead)} commits\n`);
  }
  if (gitInfo.behind > 0) {
    process.stdout.write(`Behind: ${chalk.hex(config.theme.error)(gitInfo.behind)} commits\n`);
  }
  
  onComplete();
};

const alias = (args: string[], onComplete: () => void) => {
  if (args.length === 0) {
    Object.entries(aliases).forEach(([key, value]) => {
      process.stdout.write(`${chalk.hex(config.theme.primary)(key)}=${chalk.hex(config.theme.success)(value)}\n`);
    });
  } else if (args.length === 1 && args[0].includes('=')) {
    const [key, ...valueParts] = args[0].split('=');
    aliases[key] = valueParts.join('=');
    saveAliases();
    process.stdout.write(chalk.hex(config.theme.success)(`Alias set: ${key}\n`));
  } else {
    process.stdout.write(chalk.hex(config.theme.error)('Usage: alias [name=value]\n'));
  }
  onComplete();
};

const which = (args: string[], onComplete: () => void) => {
  const command = args[0];
  if (!command) {
    process.stdout.write(chalk.hex(config.theme.error)('Usage: which <command>\n'));
    onComplete();
    return;
  }
  
  if (builtinCommands.includes(command)) {
    process.stdout.write(chalk.hex(config.theme.success)(`${command} is a shell builtin\n`));
    onComplete();
    return;
  }
  
  for (const path of pathDirs) {
    const fullPath = join(path, command);
    try {
      accessSync(fullPath, constants.X_OK);
      process.stdout.write(chalk.hex(config.theme.success)(`${fullPath}\n`));
      onComplete();
      return;
    } catch {}
  }
  
  process.stdout.write(chalk.hex(config.theme.error)(`${command} not found\n`));
  onComplete();
};

const help = (args: string[], onComplete: () => void) => {
  process.stdout.write(chalk.hex(config.theme.primary)('Drift Shell - Built-in Commands:\n\n'));
  
  const commands = [
    ['echo <text>', 'Display text'],
    ['pwd', 'Show current directory'],
    ['cd <dir>', 'Change directory'],
    ['ls [-a] [-l]', 'List directory contents'],
    ['clear', 'Clear screen'],
    ['history [n]', 'Show command history'],
    ['git-status', 'Show git repository status'],
    ['alias [name=value]', 'Set or list aliases'],
    ['which <cmd>', 'Locate command'],
    ['type <cmd>', 'Show command type'],
    ['help', 'Show this help'],
    ['exit [code]', 'Exit shell']
  ];
  
  commands.forEach(([cmd, desc]) => {
    process.stdout.write(`${chalk.hex(config.theme.success)(cmd.padEnd(20))} ${chalk.hex(config.theme.muted)(desc)}\n`);
  });
  
  process.stdout.write(chalk.hex(config.theme.primary)('\nFeatures:\n'));
  process.stdout.write(`${chalk.hex(config.theme.muted)('• Git integration with branch and status indicators\n')}`);
  process.stdout.write(`${chalk.hex(config.theme.muted)('• Smart tab completion for commands and files\n')}`);
  process.stdout.write(`${chalk.hex(config.theme.muted)('• Custom aliases support\n')}`);
  process.stdout.write(`${chalk.hex(config.theme.muted)('• Enhanced prompt with time and git info\n')}`);
  
  onComplete();
};

const cd = (args: string[], onComplete: () => void) => {
  let targetDir = args[0] || homedir();

  if (targetDir === "~") {
    targetDir = homedir();
  }

  try {
    if (existsSync(targetDir) && statSync(targetDir).isDirectory()) {
      process.chdir(targetDir);
    } else {
      process.stderr.write(chalkStderr.hex(config.theme.error)(`cd: ${targetDir}: No such file or directory\n`));
    }
  } catch (err: any) {
    process.stderr.write(chalkStderr.hex(config.theme.error)(`cd: ${err.message}\n`));
  }
  onComplete();
};

const saveHistory = () => {
  const histFile = process.env.HISTFILE || join(homedir(), '.drift_history');
  if (existsSync(histFile)) {
    try {
      const historyContent = readFileSync(histFile, "utf-8");
      const commands = historyContent
        .split("\n")
        .map((cmd) => cmd.trim())
        .filter((cmd) => cmd !== "");
      historyElements.push(...commands);
    } catch (error) {
      console.error(chalk.hex(config.theme.error)(`Failed to load history: ${error}`));
    }
  }
};

const history = (args: string[], onComplete: () => void) => {
  const num = parseInt(args[0], 10);
  const count = !isNaN(num) ? num : Math.min(historyElements.length, 20);

  const start = Math.max(historyElements.length - count, 0);
  
  if (args[0] === "-c") {
    historyElements = [];
    process.stdout.write(chalk.hex(config.theme.success)('History cleared\n'));
    onComplete();
    return;
  }

  for (let i = start; i < historyElements.length; i++) {
    const cmd = historyElements[i];
    const lineNum = chalk.hex(config.theme.muted)((i + 1).toString().padStart(4));
    process.stdout.write(`${lineNum}  ${chalk.hex(config.theme.primary)(cmd)}\n`);
  }

  onComplete();
};

const type = (args: string[], onComplete: () => void) => {
  const input = args[0] || "";

  if (builtinCommands.includes(input)) {
    process.stdout.write(chalk.hex(config.theme.success)(`${input} is a shell builtin\n`));
    onComplete();
    return;
  }

  if (aliases[input]) {
    process.stdout.write(chalk.hex(config.theme.primary)(`${input} is aliased to '${aliases[input]}'\n`));
    onComplete();
    return;
  }

  for (const path of pathDirs) {
    if (!path) continue;
    const filePath = join(path, input);
    try {
      accessSync(filePath, constants.X_OK);
      process.stdout.write(chalk.hex(config.theme.success)(`${input} is ${filePath}\n`));
      onComplete();
      return;
    } catch {}
  }

  process.stdout.write(chalk.hex(config.theme.error)(`${input}: not found\n`));
  onComplete();
};

const saveHistoryOnExit = () => {
  const histFile = process.env.HISTFILE || join(homedir(), '.drift_history');
  try {
    writeFileSync(histFile, historyElements.join("\n") + "\n", "utf-8");
  } catch (err: any) {
    process.stderr.write(chalkStderr.hex(config.theme.error)(`Failed to write history: ${err.message}\n`));
  }
};

const exit = (args: string[]) => {
  const code = args[0] ? parseInt(args[0], 10) : 0;
  process.stdout.write(chalk.hex(config.theme.primary)('\n👋 Thanks for using Drift Shell!\n'));
  saveHistoryOnExit();
  saveAliases();
  process.exit(isNaN(code) ? 1 : code);
};

const executeExternalCommand = (
  command: string,
  args: string[],
  onComplete: () => void
) => {
  let executablePath: string | null = null;
  
  for (const path of pathDirs) {
    if (!path) continue;
    const fullPath = join(path, command);
    try {
      accessSync(fullPath, constants.X_OK);
      executablePath = fullPath;
      break;
    } catch {}
  }

  if (!executablePath) {
    process.stdout.write(chalkStderr.hex(config.theme.error)(`${command}: command not found\n`));
    onComplete();
    return;
  }

  const childProcess = spawn(executablePath, args, {
    stdio: "inherit",
    argv0: command,
  });

  childProcess.on("close", () => onComplete());
  childProcess.on("error", (err) => {
    process.stderr.write(chalkStderr.hex(config.theme.error)(`Failed to start subprocess: ${err.message}\n`));
    onComplete();
  });
};

const handlers: Record<string, (args: string[], onComplete: () => void) => void> = {
  echo,
  cd,
  type,
  pwd,
  ls,
  clear,
  history,
  'git-status': gitStatus,
  alias,
  which,
  help,
  exit: (args) => exit(args),
};

const main = (): void => {
  rl.question(getPrompt(), (input: string) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      main();
      return;
    }
    
    historyElements.push(trimmedInput);
    
    const tokens = parse(trimmedInput).filter((t: any) => typeof t === "string") as string[];
    if (tokens.length === 0) {
      main();
      return;
    }

    let [command, ...args] = tokens;
    
    if (aliases[command]) {
      const aliasTokens = parse(aliases[command]).filter((t: any) => typeof t === "string") as string[];
      command = aliasTokens[0];
      args = [...aliasTokens.slice(1), ...args];
    }

    const next = () => main();

    if (handlers[command]) {
      handlers[command](args, next);
    } else {
      executeExternalCommand(command, args, next);
    }
  });
};

loadAliases();
saveHistory();

process.on('SIGINT', () => {
  process.stdout.write('\n');
  main();
});

process.on('SIGTERM', () => {
  saveHistoryOnExit();
  saveAliases();
  process.exit(0);
});

main();

function execSync(command: string) {
  return childExecSync(command);
}
