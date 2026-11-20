import { useEffect, useState } from "react";

const NAVIGATION_EVENT = "assma:navigate";

/** Client-side navigation without a router library, as in ellma. */
export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (path === `${location.pathname}${location.search}`) {
    return;
  }
  if (options.replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  window.scrollTo({ top: 0 });
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATION_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATION_EVENT, update);
    };
  }, []);
  return path;
}

/** Same-page links that keep client-side navigation and still open in new tabs. */
export function linkHandler(path: string) {
  return (event: {
    preventDefault: () => void;
    metaKey: boolean;
    ctrlKey: boolean;
    button?: number;
  }) => {
    if (event.metaKey || event.ctrlKey || (event.button ?? 0) !== 0) {
      return;
    }
    event.preventDefault();
    navigate(path);
  };
}
