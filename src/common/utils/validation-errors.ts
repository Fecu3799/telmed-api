import { ValidationError } from 'class-validator';

type FieldErrors = Record<string, string[]>;

export function mapValidationErrors(errors: ValidationError[]): FieldErrors {
  const result: FieldErrors = {};

  for (const error of errors) {
    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (messages.length > 0) {
      result[error.property] = messages;
    }

    if (error.children && error.children.length > 0) {
      const childErrors = mapValidationErrors(error.children);
      for (const [key, value] of Object.entries(childErrors)) {
        result[`${error.property}.${key}`] = value;
      }
    }
  }

  return result;
}
