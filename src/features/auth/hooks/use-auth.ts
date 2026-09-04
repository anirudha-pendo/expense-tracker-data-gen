import { useCallback, useEffect, useState } from "react";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { getDB } from "@/lib/db/client";
import { createUser, getUserByEmail, getUserByUsername } from "@/lib/db/repositories/users.repo";
import { getWorkspacesByUserId } from "@/lib/db/repositories/workspaces.repo";
import { clearSession, getSession, saveSession } from "@/lib/session";
import type { Session, User, Workspace } from "@/types";

interface AuthState {
  user: User | null;
  workspace: Workspace | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasWorkspace: boolean;
}

interface AuthActions {
  signUp: (username: string, email: string, displayName: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  setActiveWorkspace: (workspace: Workspace) => void;
  refreshUser: () => Promise<void>;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const session = getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    try {
      const db = await getDB();
      const storedUser = await db.get("users", session.userId);
      if (!storedUser) {
        clearSession();
        setIsLoading(false);
        return;
      }
      setUser(storedUser);

      if (session.workspaceId) {
        const storedWorkspace = await db.get("workspaces", session.workspaceId);
        if (storedWorkspace) setWorkspace(storedWorkspace);
      }
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const signUp = useCallback(async (username: string, email: string, displayName: string, password: string) => {
    // Both are unique in IndexedDB, so both are checked up front: email
    // because it is the sign-in identifier, username because its unique
    // index would otherwise reject the write with a raw ConstraintError
    // instead of this message.
    const existingUsername = await getUserByUsername(username);
    if (existingUsername) throw new Error("Username is already taken");

    const existingEmail = await getUserByEmail(email);
    if (existingEmail) throw new Error("Email is already registered");

    const { hash, salt } = await hashPassword(password);
    const initials = displayName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const newUser: User = {
      id: crypto.randomUUID(),
      username,
      email,
      displayName,
      avatarInitials: initials,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };

    await createUser(newUser);
    setUser(newUser);
    const session: Session = { userId: newUser.id, workspaceId: "" };
    saveSession(session);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // One identical message for "no such account" and "wrong password", on
    // purpose: anything that distinguishes them tells an attacker which
    // emails are registered. Do not split it.
    const storedUser = await getUserByEmail(email);
    if (!storedUser) throw new Error("Invalid email or password");

    const valid = await verifyPassword(password, storedUser.passwordHash, storedUser.salt);
    if (!valid) throw new Error("Invalid email or password");

    setUser(storedUser);
    const workspaces = await getWorkspacesByUserId(storedUser.id);
    const activeWorkspace = workspaces[0] ?? null;
    setWorkspace(activeWorkspace);

    const session: Session = {
      userId: storedUser.id,
      workspaceId: activeWorkspace?.id ?? "",
    };
    saveSession(session);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setWorkspace(null);
  }, []);

  const setActiveWorkspace = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    const session = getSession();
    if (session) {
      saveSession({ ...session, workspaceId: ws.id });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    const db = await getDB();
    const updated = await db.get("users", user.id);
    if (updated) setUser(updated);
  }, [user]);

  return {
    user,
    workspace,
    isLoading,
    isAuthenticated: !!user,
    hasWorkspace: !!workspace,
    signUp,
    signIn,
    signOut,
    setActiveWorkspace,
    refreshUser,
  };
}
