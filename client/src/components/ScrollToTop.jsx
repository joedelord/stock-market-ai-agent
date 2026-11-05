import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

// BrowserRouter keeps the scroll position between pages, so a link at the
// bottom of one page would open the next page in the middle. Back and forward
// (POP) are left alone so the browser can restore the earlier position.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
}
