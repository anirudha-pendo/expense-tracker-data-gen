import type { User, Workspace } from "@/types";

/**
 * The one place the Pendo payload is built.
 *
 * Five call sites need this object. Five hand-rolled copies of it is five
 * chances for one field to go missing from one of them, and a field missing
 * from one call site is a segment that quietly under-counts — nothing throws,
 * nothing fails a build, the numbers are just wrong.
 */
export function buildIdentifyOptions(user: User, workspace: Workspace | null): PendoOptions {
  const options: PendoOptions = {
    visitor: {
      id: user.id,
      full_name: user.displayName,
      username: user.username,
      avatarInitials: user.avatarInitials,
      createdAt: user.createdAt,
    },
  };

  // Set only when there is one, rather than always. Accounts created before
  // email existed have none, and `email: undefined` is not the same as an
  // absent key: Pendo stores the key and the visitor then reads as "has an
  // email, and it is blank" instead of "predates emails".
  if (user.email) {
    options.visitor.email = user.email;
  }

  // No workspace means no account yet. Between sign-up and workspace setup a
  // user genuinely belongs to nothing, and a placeholder account here would
  // put one junk row into Pendo for every abandoned setup.
  if (workspace) {
    options.account = {
      id: workspace.id,
      name: workspace.name,
      currency: workspace.currency,
      locale: workspace.locale,
      createdAt: workspace.createdAt,
    };
  }

  return options;
}

/** Identify the visitor, and the account when the user has a workspace. */
export function identify(user: User, workspace: Workspace | null): void {
  pendo?.identify(buildIdentifyOptions(user, workspace));
}

/**
 * Refresh visitor and account metadata mid-session, without restarting the
 * session the way `identify` does. Used when a workspace is renamed or its
 * money settings change — the account is already in flight and only its
 * fields moved.
 */
export function updateOptions(user: User, workspace: Workspace | null): void {
  pendo?.updateOptions(buildIdentifyOptions(user, workspace));
}
