import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import ScrollToTop from "./ScrollToTop";

function Page({ title }) {
  const navigate = useNavigate();

  return (
    <>
      <h1>{title}</h1>
      <button type="button" onClick={() => navigate("/privacy")}>
        Privacy
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

const renderApp = () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Page title="Home" />} />
        <Route path="/privacy" element={<Page title="Privacy page" />} />
      </Routes>
    </MemoryRouter>,
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollToTop", () => {
  test("scrolls to the top when a link opens another page", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    renderApp();
    scrollTo.mockClear();

    await user.click(screen.getByRole("button", { name: "Privacy" }));

    expect(
      await screen.findByRole("heading", { name: "Privacy page" }),
    ).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  test("leaves the position alone on back navigation", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    renderApp();
    await user.click(screen.getByRole("button", { name: "Privacy" }));
    await screen.findByRole("heading", { name: "Privacy page" });
    scrollTo.mockClear();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
