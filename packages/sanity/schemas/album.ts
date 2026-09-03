import { defineType, defineField } from "sanity";
import { DRIVE_STORAGE, SANITY_STORAGE } from "@ylx/shared";
import { CUSTOM_SLUG_PATTERN } from "../lib/constants";
export default defineType({
  name: "album",
  title: "Album",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "clientName",
      title: "Client Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "vendorName",
      title: "Vendor Name",
      type: "string",
      description:
        "Photographer/studio brand shown to the client on the gallery page (header and browser tab). " +
        "Albums created before this field existed fall back to 'YLx' in the app.",
      validation: (Rule) => Rule.required().max(80),
    }),
    defineField({
      name: "eventDate",
      title: "Event Date",
      type: "date",
      description: "Optional — albums are often created before a date is finalized.",
    }),
    defineField({
      name: "pin",
      title: "PIN",
      type: "string",
      validation: (Rule) =>
        Rule.required().custom((value) => {
          if (!value) return true; // required() handles empty
          return /^\d{4}$/.test(value) || "PIN must be exactly 4 digits (numbers only)";
        }),
    }),
    defineField({
      name: "maxSelections",
      title: "Maximum Selections",
      type: "number",
      validation: (Rule) => Rule.required().integer().min(1).max(500),
    }),
    defineField({
      name: "storageType",
      title: "Storage Type",
      type: "string",
      description:
        "Where the album's photo binaries live. 'sanity' = uploaded to Sanity assets; " +
        "'drive' = photos stay in the photographer's Google Drive folder (photo docs " +
        "carry driveFileId instead of an image asset). Locked after creation — " +
        "switching mid-life would orphan selections.",
      options: {
        list: [
          { title: "Sanity (upload)", value: SANITY_STORAGE },
          { title: "Google Drive (link)", value: DRIVE_STORAGE },
        ],
      },
      initialValue: SANITY_STORAGE,
      readOnly: true,
      // Deliberately NOT Rule.required(): albums created before this field
      // existed have no storageType, and a required rule would block Studio
      // publishes for them. Absent === SANITY_STORAGE everywhere in code.
    }),
    defineField({
      name: "driveFolderId",
      title: "Google Drive Folder ID",
      type: "string",
      description: "Opaque Drive folder id — set at creation when storageType is DRIVE_STORAGE.",
      hidden: ({ parent }) => parent?.storageType !== DRIVE_STORAGE,
      readOnly: true, // drift here would orphan the ingested photos
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      description:
        "Lifecycle: 'active' (open for client selection) → 'submitted' (client submitted, closed) → 'locked' (admin locked; unlock resets to 'active'). " +
        "IMPORTANT for external consumers: a closed album is anything with status !== 'active'. Do NOT test for status === 'locked' alone — that misses 'submitted' albums.",
      options: {
        list: [
          { title: "Active", value: "active" },
          { title: "Submitted", value: "submitted" },
          { title: "Locked", value: "locked" },
          { title: "Delivered", value: "delivered" },
        ],
      },
      initialValue: "active",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "photos",
      title: "Photos",
      type: "array",
      of: [{ type: "reference", to: [{ type: "photo" }] }],
    }),
    defineField({
      name: "finalPhotos",
      title: "Final Photos",
      description: "Photos delivered to client after editing",
      type: "array",
      of: [{ type: "reference", to: [{ type: "photo" }] }],
    }),
    defineField({
      name: "customSlug",
      title: "Custom Slug",
      type: "string",
      description: "Optional custom URL slug (leave empty for auto-generated)",
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value) return true;
          return CUSTOM_SLUG_PATTERN.test(value) ||
            "Slug must contain only lowercase letters, numbers, and hyphens";
        }),
    }),
    defineField({
      name: "shareCount",
      title: "Share Count",
      type: "number",
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: "lastAccessedAt",
      title: "Last Accessed",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "lastUnlockedAt",
      title: "Last Unlocked",
      description: "Set on every unlock; client drafts saved before this moment are discarded.",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "showOriginalAfterDelivery",
      title: "Show Original Photos After Delivery",
      description: "Set at delivery time via the deliver dialog. When on, the client can still view/download the original proofing photos alongside the final edited photos.",
      type: "boolean",
      initialValue: true,
      // Studio-UI-only guard: editing this directly here would skip
      // deliver.ts's cache invalidation + realtime `album:delivered` event,
      // leaving an already-open client gallery with a stale value (same
      // class of bug as lastUnlockedAt/shareCount above). sanityWriteClient
      // in deliver.ts bypasses this (readOnly only affects the Studio UI,
      // not API writes), so it remains the only practical writer.
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: "title",
      clientName: "clientName",
      eventDate: "eventDate",
    },
    prepare({ title, clientName, eventDate }) {
      return {
        title,
        subtitle: eventDate ? `${clientName} - ${eventDate}` : clientName,
      };
    },
  },
});
