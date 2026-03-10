import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { CliError } from "./errors.js";

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...options.env },
  });

  if (result.error) {
    throw new CliError(`Failed to execute ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = stderr || stdout;
    throw new CliError(
      details ? `${command} ${args.join(" ")} failed: ${details}` : `${command} ${args.join(" ")} failed`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function runCommandStreaming(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.on("error", (error) => {
      reject(new CliError(`Failed to execute ${command}: ${error.message}`, { cause: error }));
    });

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      options.onStdout?.(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      options.onStderr?.(text);
    });

    child.on("close", (code) => {
      const status = code ?? 1;

      if (status !== 0 && !options.allowFailure) {
        const details = stderr.trim() || stdout.trim();
        reject(
          new CliError(
            details ? `${command} ${args.join(" ")} failed: ${details}` : `${command} ${args.join(" ")} failed`,
          ),
        );
        return;
      }

      resolve({ status, stdout, stderr });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

export function runCommandInteractive(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    input: options.input,
  });

  if (result.error) {
    throw new CliError(`Failed to execute ${command}: ${result.error.message}`, {
      cause: result.error,
    });
  }

  const status = result.status ?? 1;

  if (status !== 0 && !options.allowFailure) {
    throw new CliError(`${command} ${args.join(" ")} failed with exit code ${status}`);
  }

  return { status };
}

export function runCommandInheritAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new CliError(`Failed to execute ${command}: ${error.message}`, { cause: error }));
    });

    child.on("close", (code) => {
      const status = code ?? 1;

      if (status !== 0 && !options.allowFailure) {
        reject(new CliError(`${command} ${args.join(" ")} failed with exit code ${status}`));
        return;
      }

      resolve({ status });
    });

    options.onChild?.(child);
  });
}

export function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => {});
  child.unref();
}
