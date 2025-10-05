import { ZodError } from 'zod';

/**
 * Error thrown when configuration validation fails
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError?: ZodError
  ) {
    super(message);
    this.name = 'ConfigValidationError';
    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }

  /**
   * Creates a user-friendly error message from a Zod validation error
   */
  static fromZodError(error: ZodError): ConfigValidationError {
    const issues = error.issues.map((err) => {
      const path = err.path.join('.');
      return `  - ${path}: ${err.message}`;
    });

    const message = [
      'Configuration validation failed:',
      '',
      ...issues,
      '',
      'Please check your environment variables and .env file.',
    ].join('\n');

    return new ConfigValidationError(message, error);
  }

  /**
   * Creates an error for missing required environment variables
   */
  static missingRequired(variables: string[]): ConfigValidationError {
    const message = [
      'Missing required environment variables:',
      '',
      ...variables.map((v) => `  - ${v}`),
      '',
      'Please set these variables in your .env file or environment.',
    ].join('\n');

    return new ConfigValidationError(message);
  }
}

/**
 * Error thrown when trying to access config before it's loaded
 */
export class ConfigNotLoadedError extends Error {
  constructor() {
    super(
      'Configuration has not been loaded yet. Call loadConfig() before accessing configuration.'
    );
    this.name = 'ConfigNotLoadedError';
    Object.setPrototypeOf(this, ConfigNotLoadedError.prototype);
  }
}
