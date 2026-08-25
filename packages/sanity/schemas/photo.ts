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
        "Exactly one of image/driveFileId is present per photo (enforced at the API layer).",
      hidden: ({ parent }) => Boolean(parent?.image),
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: {
        hotspot: true,
      },
      validation: (Rule) => Rule.required(),
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
