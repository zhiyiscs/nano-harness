import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlockPalette } from "./BlockPalette";

describe("BlockPalette", () => {
  it("renders the core harness blocks", () => {
    render(<BlockPalette />);

    expect(screen.getByText("Harness Blocks")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Working Memory")).toBeInTheDocument();
    expect(screen.getByText("Context Builder")).toBeInTheDocument();
    expect(screen.getByText("Search Tool")).toBeInTheDocument();
    expect(screen.getByText("Evaluator")).toBeInTheDocument();
  });
});
