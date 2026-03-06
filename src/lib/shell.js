import { spawnSync } from "node:child_process";
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
