import type { JwtPayload } from "./index";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
    }
  }
}

export {};
