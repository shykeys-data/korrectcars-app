// What our middleware adds to Express requests (TypeScript checks the JavaScript against this).
import 'express';

declare global {
  namespace Express {
    interface Request {
      /** The signed-in user, set by the session middleware (server/lib/auth.js) */
      user?: { id: number; name: string; email: string; role: string; [k: string]: any };
      /** The seller account of the signed-in member, set by requireDealer (server/routes/dealer.js) */
      dealer?: { id: number; status: string; kind?: string; member_role?: string; [k: string]: any };
      /** owner, manager or lister inside a seller's team */
      role?: string;
      /** The request body after zod validation (server/lib/validate.js) */
      valid?: any;
      /** true when this session passed the two-step code (server/lib/security.js) */
      mfa?: boolean;
    }
  }
}
// Helpers some routers expose for render.js and other routers
declare module 'express-serve-static-core' {
  interface Router { [helper: string]: any }
}
