import { describe, it, expect } from "vitest";
import { validateAlbumForm } from "./AlbumFormModal";

const BASE_FORM = {
  title: "Doe Wedding",
  clientName: "Jane Doe",
  eventDate: "",
  pin: "1234",
  maxSelections: 20 as number | "",
  customSlug: "",
  vendorName: "Aurora Studios",
};

describe("validateAlbumForm", () => {
  it("accepts a form with no event date at all — the field is optional", () => {
    expect(validateAlbumForm({ ...BASE_FORM, eventDate: "" })).toBeNull();
  });

  it("accepts a past event date — weddings are commonly proofed after they happened", () => {
    expect(validateAlbumForm({ ...BASE_FORM, eventDate: "2000-01-01" })).toBeNull();
  });

  it("accepts a future event date too", () => {
    expect(validateAlbumForm({ ...BASE_FORM, eventDate: "2999-01-01" })).toBeNull();
  });

  it("still rejects a missing title", () => {
    expect(validateAlbumForm({ ...BASE_FORM, title: "" })).toBe("Album title is required");
  });

  it("still rejects a missing client name", () => {
    expect(validateAlbumForm({ ...BASE_FORM, clientName: "" })).toBe("Client name is required");
  });

  it("still rejects a missing vendor name", () => {
    expect(validateAlbumForm({ ...BASE_FORM, vendorName: "" })).toBe("Vendor name is required");
  });

  it("still rejects a PIN that isn't exactly 4 digits", () => {
    expect(validateAlbumForm({ ...BASE_FORM, pin: "12" })).toBe("PIN must be exactly 4 digits");
  });

  it("still rejects an invalid custom slug", () => {
    expect(validateAlbumForm({ ...BASE_FORM, customSlug: "Not Valid!" })).toBe(
      "Custom slug must contain only lowercase letters, numbers, and hyphens"
    );
  });

  it("still rejects max selections above 500", () => {
    expect(validateAlbumForm({ ...BASE_FORM, maxSelections: 501 })).toBe(
      "Max selections cannot exceed 500"
    );
  });
});
