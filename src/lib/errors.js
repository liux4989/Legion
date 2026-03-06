export class CliError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CliError";
    this.cause = options.cause;
  }
}

export function formatError(error) {
  if (error instanceof CliError) {
    return error.message;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
