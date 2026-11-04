import { createAuthClient } from "better-auth/react";
import { API_URL } from "./config";

export const authClient = createAuthClient({ baseURL: `${API_URL}/api/auth` });
