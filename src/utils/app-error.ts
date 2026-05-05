export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const isAppError = (
  err: unknown,
): err is { status: number; message: string } => {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err &&
    typeof (err as Record<string, unknown>).status === "number"
  );
};
