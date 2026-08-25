import { defineType, defineField } from "sanity";

export default defineType({
  name: "photo",
  title: "Photo",
  type: "document",
  fields: [
    defineField({
      name: "filename",
      title: "Filename",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "driveFileId",
      title: "Google Drive File ID",
      type: "string",
      description:
        "Set for Drive-sourced photos, which have no Sanity image asset. " +
        "Exactly one of image/driveFileId must be present per photo.",
      hidden: ({ parent }) => Boolean(parent?.image),
      // Studio-enforced XOR (cubic round-2): the API layer is the primary
      // writer, but Studio can publish photos too — without these checks an
      // editor could save a photo with neither field and break rendering.
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as { image?: unknown } | undefined;
          return value && parent?.image
            ? "Cannot set both a Sanity image and a Google Drive file id"
            : true;
        }),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: {
        hotspot: true,
      },
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as { driveFileId?: string } | undefined;
          return !value && parent?.driveFileId
            ? true
            : value
              ? true
              : "Photo needs either a Sanity image or a Google Drive file id";
        }),
    }),
    defineField({
      name: "driveResourceKey",
      title: "Google Drive Resource Key",
      type: "string",
      description:
        "Link-sharing resource key for the Drive file — must ride along on " +
        "thumbnail/download URLs or they 403. Null when the file has none.",
      hidden: ({ parent }) => !parent?.driveFileId,
    }),
    defineField({
      name: "album",
      title: "Album",
      type: "reference",
      to: [{ type: "album" }],
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "filename",
      media: "image",
    },
  },
});
