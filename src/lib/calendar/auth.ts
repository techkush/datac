// Password hashing + JWT issuing/verification for the single-user (extensible
// to multi-user) auth model. All tokens are stateless; the only server secret
// is JWT_SECRET.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set it in .env (>= 16 chars).",
    );
  }
  return s;
}

export interface TokenPayload {
  sub: string; // user id
  email: string;
  role: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret(), {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === "string") return null;
    const { sub, email, role } = decoded as jwt.JwtPayload;
    if (typeof sub !== "string") return null;
    return { sub, email: String(email ?? ""), role: String(role ?? "USER") };
  } catch {
    return null;
  }
}
