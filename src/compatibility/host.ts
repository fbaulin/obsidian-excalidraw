/** Optional host APIs must not be called while the plugin module is loading. */
export function getNoticeElement<T>(notice: { noticeEl: T; messageEl?: T }): T {
  return notice.messageEl ?? notice.noticeEl;
}

export function getHostLanguage(
  host: object,
  readLegacyLanguage: () => string | null,
): string {
  if ("getLanguage" in host && typeof host.getLanguage === "function") {
    const readLanguage = host.getLanguage as () => unknown;
    const language: unknown = readLanguage.call(host);
    if (typeof language === "string" && language) return language;
  }
  try {
    return readLegacyLanguage() || "en";
  } catch {
    // Storage may be unavailable in a restricted renderer.
    return "en";
  }
}

export function supportsAttachmentSave(host: object): boolean {
  return "saveAttachment" in host && typeof host.saveAttachment === "function";
}

export function supportsNativeCli(
  host: object,
  isDesktop: boolean,
  hasApiVersion: (version: string) => boolean,
): boolean {
  return isDesktop && hasApiVersion("1.12.2") &&
    "registerCliHandler" in host && typeof host.registerCliHandler === "function";
}

export async function loadLeafIfDeferred(leaf: object): Promise<void> {
  // Before 1.7.2 views are loaded eagerly by setViewState/openFile.
  if ("loadIfDeferred" in leaf && typeof leaf.loadIfDeferred === "function") {
    const load = leaf.loadIfDeferred as () => Promise<void>;
    await load.call(leaf);
  }
}