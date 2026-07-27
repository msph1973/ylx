import { describe, it, expect } from "vitest";
import type { Selection } from "@ylx/shared";
import {
  formatCommaSeparated,
  formatPerLine,
  formatCsv,
  formatSelections,
} from "./selectionExport";

function makeSelection(filename: string, notes?: string): Selection {
  return {
    id: `sel-${filename}`,
    albumId: "album-1",
    photoId: `photo-${filename}`,
    photo: {
      id: `photo-${filename}`,
      albumId: "album-1",
      filename,
      url: `https://cdn.example/${filename}`,
      thumbnailUrl: `https://cdn.example/thumb-${filename}`,
    },
    selectedAt: new Date("2026-07-27T00:00:00Z"),
    notes,
  };
}

const selections = [
  makeSelection("IMG_0001.jpg", "crop tighter"),
  makeSelection("IMG_0002.jpg"),
  makeSelection("IMG_0003.jpg", "b&w please"),
];

describe("formatCommaSeparated", () => {
  it("joins filenames with comma+space", () => {
    expect(formatCommaSeparated(selections)).toBe(
      "IMG_0001.jpg, IMG_0002.jpg, IMG_0003.jpg"
    );
  });

  it("returns empty string for no selections", () => {
    expect(formatCommaSeparated([])).toBe("");
  });
});

describe("formatPerLine", () => {
  it("joins filenames with newlines", () => {
    expect(formatPerLine(selections)).toBe(
      "IMG_0001.jpg\nIMG_0002.jpg\nIMG_0003.jpg"
    );
  });
});

describe("formatCsv", () => {
  it("emits header + filename,notes rows", () => {
    expect(formatCsv(selections)).toBe(
      [
        "filename,notes",
        "IMG_0001.jpg,crop tighter",
        "IMG_0002.jpg,",
        "IMG_0003.jpg,b&w please",
      ].join("\n")
    );
  });

  it("quotes fields containing commas per RFC 4180", () => {
    const csv = formatCsv([makeSelection("IMG_1.jpg", "left, then right")]);
    expect(csv).toBe('filename,notes\nIMG_1.jpg,"left, then right"');
  });

  it("escapes double quotes by doubling them", () => {
    const csv = formatCsv([makeSelection("IMG_1.jpg", 'the "hero" shot')]);
    expect(csv).toBe('filename,notes\nIMG_1.jpg,"the ""hero"" shot"');
  });

  it("quotes fields containing newlines", () => {
    const csv = formatCsv([makeSelection("IMG_1.jpg", "line one\nline two")]);
    expect(csv).toBe('filename,notes\nIMG_1.jpg,"line one\nline two"');
  });

  it("quotes filenames containing commas too", () => {
    const csv = formatCsv([makeSelection("weird,name.jpg", "ok")]);
    expect(csv).toBe('filename,notes\n"weird,name.jpg",ok');
  });

  it("emits only the header for no selections", () => {
    expect(formatCsv([])).toBe("filename,notes");
  });

  it.each(["=", "+", "-", "@"])(
    "neutralizes notes starting with %s against formula injection",
    (prefix) => {
      const csv = formatCsv([makeSelection("IMG_1.jpg", `${prefix}HYPERLINK("http://evil")`)]);
      expect(csv).toBe(
        `filename,notes\nIMG_1.jpg,"'${prefix}HYPERLINK(""http://evil"")"`
      );
    }
  );

  it("neutralizes malicious filenames too", () => {
    const csv = formatCsv([makeSelection("=cmd|calc.jpg", "ok")]);
    expect(csv).toBe("filename,notes\n'=cmd|calc.jpg,ok");
  });

  it("neutralizes fields starting with tab or carriage return", () => {
    const csv = formatCsv([makeSelection("IMG_1.jpg", "\t=SUM(A1)")]);
    expect(csv).toBe("filename,notes\nIMG_1.jpg,'\t=SUM(A1)");
  });
});

describe("formatSelections", () => {
  it("dispatches to the right formatter", () => {
    expect(formatSelections(selections, "comma")).toBe(formatCommaSeparated(selections));
    expect(formatSelections(selections, "line")).toBe(formatPerLine(selections));
    expect(formatSelections(selections, "csv")).toBe(formatCsv(selections));
  });
});
