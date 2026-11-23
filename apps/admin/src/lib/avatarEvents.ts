/** Fired when the profile of the signed in user changed (picture or name), so the header reads it again. */
export const AVATAR_CHANGED = "avatar-changed";

export function announceAvatarChanged(): void {
  window.dispatchEvent(new Event(AVATAR_CHANGED));
}
