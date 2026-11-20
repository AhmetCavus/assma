export class AssmaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new AssmaError(404, "not_found");
