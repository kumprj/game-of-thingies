import {useState} from "react";
import {act, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, it, expect, vi} from "vitest";
import Modal from "./Modal";

function Harness({onClose}: {onClose: () => void}) {
  const [, setTick] = useState(0);
  return (
      <div>
        <button onClick={() => setTick(t => t + 1)}>rerender</button>
        {/* Inline arrow: a new onClose identity on every render, like the real call sites. */}
        <Modal onClose={() => onClose()} role="dialog" labelledBy="t">
          <h3 id="t">Who wrote this?</h3>
          <button>Alice</button>
          <button>Bob</button>
        </Modal>
      </div>
  );
}

describe("Modal", () => {
  it("focuses the first control on mount", () => {
    render(<Harness onClose={() => {}}/>);
    expect(screen.getByText("Alice")).toHaveFocus();
  });

  it("keeps focus on the focused name when the page re-renders", () => {
    render(<Harness onClose={() => {}}/>);
    screen.getByText("Bob").focus();
    expect(screen.getByText("Bob")).toHaveFocus();
    // Re-render the parent (new onClose identity) without moving focus away from the dialog.
    act(() => screen.getByText("rerender").click());
    expect(screen.getByText("Bob")).toHaveFocus();
  });

  it("calls the latest onClose on Escape", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose}/>);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
